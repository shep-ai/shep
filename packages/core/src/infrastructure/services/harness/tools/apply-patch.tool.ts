/**
 * Builtin harness tool: apply_patch (spec 119).
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ChunkKind, RiskClass, ToolReadWriteMode } from '../../../../domain/generated/output.js';
import type {
  IToolExecutor,
  ToolExecutionContext,
  ToolExecutionOutput,
} from '../../../../application/ports/output/harness/index.js';
import { ToolInputError, impl, resolveInsideRepo } from './tool-support.js';

interface Edit {
  path: string;
  oldText: string;
  newText: string;
}

export class ApplyPatchTool implements IToolExecutor {
  readonly implementation = impl(
    'builtin.apply_patch',
    'apply_patch',
    'apply_patch',
    'Change repository files: exact text edits, whole-file writes, or a unified diff',
    ToolReadWriteMode.Write,
    RiskClass.Medium,
    {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: 'Exact replacements; oldText must occur exactly once in the file',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', minLength: 1 },
              oldText: { type: 'string', minLength: 1 },
              newText: { type: 'string' },
            },
            required: ['path', 'oldText', 'newText'],
            additionalProperties: false,
          },
        },
        files: {
          type: 'array',
          description: 'Create or overwrite whole files',
          items: {
            type: 'object',
            properties: { path: { type: 'string', minLength: 1 }, content: { type: 'string' } },
            required: ['path', 'content'],
            additionalProperties: false,
          },
        },
        patch: { type: 'string', description: 'A unified diff applied with git apply' },
      },
      minProperties: 1,
      additionalProperties: false,
    },
    'Prefer `edits` for small changes: each oldText must match exactly once (include enough surrounding lines). Use `files` to create new files. Paths are repository-relative; anything outside the repository is rejected.'
  );

  async execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext
  ): Promise<ToolExecutionOutput> {
    const changed = new Set<string>();
    const report: string[] = [];
    // Validate everything first so a bad edit leaves every file untouched.
    const staged: { abs: string; rel: string; content: string }[] = [];
    for (const e of (args.edits as Edit[] | undefined) ?? []) {
      const { abs, rel } = resolveInsideRepo(ctx.repoRoot, ctx.cwd, e.path);
      const pending = staged.find((s) => s.abs === abs);
      let text: string;
      try {
        text = pending?.content ?? (await readFile(abs, 'utf8'));
      } catch {
        throw new ToolInputError(`Cannot edit ${rel}: file not found`);
      }
      const count = text.split(e.oldText).length - 1;
      if (count !== 1) {
        throw new ToolInputError(
          `Edit for ${rel}: oldText must match exactly once (matched ${count} times)`
        );
      }
      const next = text.replace(e.oldText, () => e.newText);
      if (pending) pending.content = next;
      else staged.push({ abs, rel, content: next });
      report.push(`edited ${rel}`);
    }
    for (const f of (args.files as { path: string; content: string }[] | undefined) ?? []) {
      const { abs, rel } = resolveInsideRepo(ctx.repoRoot, ctx.cwd, f.path);
      staged.push({ abs, rel, content: f.content });
      report.push(`wrote ${rel}`);
    }
    const patch = typeof args.patch === 'string' && args.patch.trim() ? args.patch : undefined;
    if (patch) {
      for (const p of this.patchPaths(patch)) resolveInsideRepo(ctx.repoRoot, ctx.repoRoot, p);
      await this.gitApply(ctx.repoRoot, patch, true);
    }
    for (const s of staged) {
      await mkdir(dirname(s.abs), { recursive: true });
      await writeFile(s.abs, s.content);
      changed.add(s.rel);
    }
    if (patch) {
      await this.gitApply(ctx.repoRoot, patch, false);
      for (const p of this.patchPaths(patch)) changed.add(p);
      report.push(`applied patch (${this.patchPaths(patch).length} files)`);
    }
    const changedPaths = [...changed].sort();
    return {
      ok: true,
      output: report.join('\n'),
      kind: ChunkKind.ToolOutput,
      label: `apply_patch ${changedPaths.join(', ')}`,
      summary: `${changedPaths.length} files changed`,
      changedPaths,
    };
  }

  private patchPaths(patch: string): string[] {
    const paths = new Set<string>();
    for (const m of patch.matchAll(/^(?:\+\+\+|---) (?:[ab]\/)?(.+)$/gm)) {
      const p = m[1].trim();
      if (p !== '/dev/null') paths.add(p);
    }
    return [...paths];
  }

  private gitApply(root: string, patch: string, checkOnly: boolean): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const child = execFile(
        'git',
        [
          '-C',
          root,
          'apply',
          ...(checkOnly ? ['--check'] : []),
          '--recount',
          '--whitespace=nowarn',
          '-',
        ],
        { windowsHide: true },
        (error, _stdout, stderr) => {
          if (error)
            reject(new ToolInputError(`Patch did not apply: ${stderr.trim() || error.message}`));
          else resolvePromise();
        }
      );
      child.stdin?.end(patch);
    });
  }
}
