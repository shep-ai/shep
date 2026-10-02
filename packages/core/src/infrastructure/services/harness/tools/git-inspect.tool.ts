/**
 * Builtin harness tool: git_inspect (spec 119).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ChunkKind, RiskClass, ToolReadWriteMode } from '../../../../domain/generated/output.js';
import type {
  IToolExecutor,
  ToolExecutionContext,
  ToolExecutionOutput,
} from '../../../../application/ports/output/harness/index.js';
import { MAX_GIT_BUFFER, impl, resolveInsideRepo } from './tool-support.js';

const execFileAsync = promisify(execFile);

export class GitInspectTool implements IToolExecutor {
  readonly implementation = impl(
    'builtin.git_inspect',
    'inspect_git',
    'git_inspect',
    'Show git status or the diff of the working tree (optionally staged or for one path)',
    ToolReadWriteMode.Read,
    RiskClass.Low,
    {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['status', 'diff'] },
        staged: { type: 'boolean' },
        path: { type: 'string' },
      },
      required: ['mode'],
      additionalProperties: false,
    }
  );

  async execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext
  ): Promise<ToolExecutionOutput> {
    const mode = args.mode === 'diff' ? 'diff' : 'status';
    const argv =
      mode === 'status'
        ? ['status', '--short', '--branch']
        : ['diff', '--no-ext-diff', ...(args.staged === true ? ['--cached'] : [])];
    if (typeof args.path === 'string' && args.path) {
      argv.push('--', resolveInsideRepo(ctx.repoRoot, ctx.cwd, args.path).rel);
    }
    const { stdout } = await execFileAsync('git', ['-C', ctx.repoRoot, ...argv], {
      maxBuffer: MAX_GIT_BUFFER,
      encoding: 'utf8',
      windowsHide: true,
    });
    const files = mode === 'diff' ? (stdout.match(/^diff --git /gm) ?? []).length : 0;
    return {
      ok: true,
      output: stdout,
      kind: mode === 'diff' ? ChunkKind.Diff : ChunkKind.CommandOutput,
      label: mode === 'diff' ? `git diff${args.staged === true ? ' --cached' : ''}` : 'git status',
      summary: mode === 'diff' ? `${files} files changed` : 'git status',
    };
  }
}
