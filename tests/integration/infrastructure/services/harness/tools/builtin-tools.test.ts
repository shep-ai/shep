/**
 * Builtin harness tools against a real temporary git repository (spec 119).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ChunkKind } from '@/domain/generated/output.js';
import {
  ApplyPatchTool,
  GitInspectTool,
  ListFilesTool,
  ReadFileTool,
  RunCommandTool,
  RunTestsTool,
  SearchSourceTool,
  createBuiltinTools,
  detectTestCommand,
} from '@/infrastructure/services/harness/tools/builtin-tools.js';
import { ToolInputError } from '@/infrastructure/services/harness/tools/tool-support.js';
import type { ToolExecutionContext } from '@/application/ports/output/harness/index.js';
import {
  createTempGitRepo,
  isolateGitEnv,
  type TempGitRepo,
} from '../../../../../helpers/harness/temp-git-repo.js';

const FILES = {
  'src/auth/refresh.ts': 'export function refresh(token: string) {\n  return token;\n}\n',
  'src/auth/session.ts': 'import { refresh } from "./refresh";\nexport const s = refresh("x");\n',
  'README.md': '# demo\n',
  'package.json': JSON.stringify({ name: 'demo', scripts: { test: 'node -e "process.exit(0)"' } }),
};

describe('builtin harness tools', () => {
  let restore: () => void;
  let repo: TempGitRepo;
  let ctx: ToolExecutionContext;

  beforeAll(() => {
    restore = isolateGitEnv();
  });
  afterAll(() => restore());
  beforeEach(() => {
    repo = createTempGitRepo(FILES);
    ctx = { cwd: repo.root, repoRoot: repo.root, timeoutMs: 30_000 };
  });
  afterEach(() => repo.cleanup());

  it('exposes seven tools with unique ids and JSON schemas', () => {
    const tools = createBuiltinTools();
    expect(tools.map((t) => t.implementation.capabilityId)).toEqual([
      'list_files',
      'search_source_code',
      'read_file',
      'inspect_git',
      'run_command',
      'run_tests',
      'apply_patch',
    ]);
    for (const t of tools) expect(t.implementation.inputSchema.type).toBe('object');
  });

  it('list_files filters by directory and glob', async () => {
    const out = await new ListFilesTool().execute({ path: 'src', pattern: '**/*.ts' }, ctx);
    expect(out.output.split('\n')).toEqual(['src/auth/refresh.ts', 'src/auth/session.ts']);
    expect(out.summary).toBe('2 files matching **/*.ts');
  });

  it('search_source returns path:line matches', async () => {
    const out = await new SearchSourceTool().execute({ query: 'refresh(' }, ctx);
    expect(out.kind).toBe(ChunkKind.SearchResult);
    expect(out.output).toContain('src/auth/refresh.ts:1:');
    expect(out.output).toContain('src/auth/session.ts:2:');
  });

  it('search_source returns an empty result (not an error) when nothing matches', async () => {
    const out = await new SearchSourceTool().execute({ query: 'zzz_nothing_here' }, ctx);
    expect(out.ok).toBe(true);
    expect(out.output).toBe('');
  });

  it('read_file reads whole files and ranges, and refuses paths outside the repo', async () => {
    const whole = await new ReadFileTool().execute({ path: 'src/auth/refresh.ts' }, ctx);
    expect(whole).toMatchObject({ kind: ChunkKind.File, path: 'src/auth/refresh.ts' });
    const range = await new ReadFileTool().execute(
      { path: 'src/auth/refresh.ts', startLine: 2, endLine: 2 },
      ctx
    );
    expect(range).toMatchObject({ kind: ChunkKind.FileExcerpt, output: '  return token;' });
    await expect(
      new ReadFileTool().execute({ path: '../../etc/passwd' }, ctx)
    ).rejects.toBeInstanceOf(ToolInputError);
  });

  it('git_inspect shows status and diff', async () => {
    repo.write('README.md', '# changed\n');
    const status = await new GitInspectTool().execute({ mode: 'status' }, ctx);
    expect(status.output).toContain('README.md');
    const diff = await new GitInspectTool().execute({ mode: 'diff' }, ctx);
    expect(diff).toMatchObject({ kind: ChunkKind.Diff, summary: '1 files changed' });
    expect(diff.output).toContain('+# changed');
  });

  it('run_command captures output and exit code, and enforces the timeout', async () => {
    const ok = await new RunCommandTool().execute({ command: 'node -e "console.log(42)"' }, ctx);
    expect(ok).toMatchObject({ ok: true, exitCode: 0 });
    expect(ok.output.trim()).toBe('42');
    const fail = await new RunCommandTool().execute({ command: 'node -e "process.exit(3)"' }, ctx);
    expect(fail).toMatchObject({ ok: false, exitCode: 3 });
    const slow = await new RunCommandTool().execute(
      { command: 'node -e "setTimeout(()=>{}, 20000)"' },
      { ...ctx, timeoutMs: 300 }
    );
    expect(slow.ok).toBe(false);
    expect(slow.summary).toContain('timed out');
  });

  it('run_tests uses the configured command or detects one', async () => {
    expect(await detectTestCommand(repo.root)).toBe('npm test');
    const out = await new RunTestsTool().execute(
      {},
      { ...ctx, testCommand: 'node -e "console.log(\'1 passed\')"' }
    );
    expect(out).toMatchObject({ kind: ChunkKind.TestResult, ok: true });
    expect(out.output).toContain('1 passed');
  });

  it('apply_patch applies exact edits and new files', async () => {
    const out = await new ApplyPatchTool().execute(
      {
        edits: [
          {
            path: 'src/auth/refresh.ts',
            oldText: 'return token;',
            newText: 'return token.trim();',
          },
        ],
        files: [{ path: 'src/auth/new.ts', content: 'export {};\n' }],
      },
      ctx
    );
    expect(out.changedPaths).toEqual(['src/auth/new.ts', 'src/auth/refresh.ts']);
    expect(readFileSync(join(repo.root, 'src/auth/refresh.ts'), 'utf8')).toContain('token.trim()');
    expect(existsSync(join(repo.root, 'src/auth/new.ts'))).toBe(true);
  });

  it('apply_patch leaves every file untouched when one edit does not match', async () => {
    const before = readFileSync(join(repo.root, 'src/auth/refresh.ts'), 'utf8');
    await expect(
      new ApplyPatchTool().execute(
        {
          edits: [
            { path: 'src/auth/refresh.ts', oldText: 'return token;', newText: 'x' },
            { path: 'src/auth/session.ts', oldText: 'NOT PRESENT', newText: 'y' },
          ],
        },
        ctx
      )
    ).rejects.toThrow(/matched 0 times/);
    expect(readFileSync(join(repo.root, 'src/auth/refresh.ts'), 'utf8')).toBe(before);
  });

  it('apply_patch rejects writes outside the repository', async () => {
    await expect(
      new ApplyPatchTool().execute({ files: [{ path: '../escape.txt', content: 'x' }] }, ctx)
    ).rejects.toBeInstanceOf(ToolInputError);
  });

  it('apply_patch applies a unified diff and rejects one that does not apply', async () => {
    const patch = [
      'diff --git a/README.md b/README.md',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1 +1 @@',
      '-# demo',
      '+# patched',
      '',
    ].join('\n');
    const out = await new ApplyPatchTool().execute({ patch }, ctx);
    expect(out.changedPaths).toEqual(['README.md']);
    expect(readFileSync(join(repo.root, 'README.md'), 'utf8')).toBe('# patched\n');
    await expect(new ApplyPatchTool().execute({ patch }, ctx)).rejects.toThrow(/did not apply/);
  });
});
