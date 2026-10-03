/**
 * shep harness * — CLI command tests (spec 119, task 27). Each subcommand
 * resolves a use case from the container; the container is stubbed by class
 * name and output is captured from console.log.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GrantScope,
  HarnessMode,
  HarnessSessionOrigin,
  HarnessTaskOutcome,
} from '@/domain/generated/output.js';

const { mockResolve, impls } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  impls: {} as Record<string, { execute: ReturnType<typeof vi.fn> }>,
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

import { createHarnessCommand } from '../../../../../../src/presentation/cli/commands/harness/index.js';
import { runOverrides } from '../../../../../../src/presentation/cli/commands/harness/run.command.js';

const session = {
  id: 'sess-1234-5678',
  origin: HarnessSessionOrigin.Standalone,
  mode: HarnessMode.QueryAware,
  status: 'idle',
  title: 'Fix refresh',
  worktreePath: '/wt/harness-sess1234',
  worktreeBranch: 'harness/sess1234',
};
const usage = {
  inputTokens: 1200,
  outputTokens: 80,
  cachedInputTokens: 0,
  costUsd: 0.0123,
  turns: 3,
  apiLatencyMs: 10,
};
const runResult = {
  session,
  task: { id: 'task-1' },
  result: {
    status: HarnessTaskOutcome.Success,
    summary: 'Trimmed the token.',
    evidence: [{ resource: 'src/refresh.ts', startLine: 2, endLine: 2 }],
    producedChunkIds: [],
  },
  text: 'done',
  usage,
};

async function run(...args: string[]): Promise<string> {
  const out: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    out.push(a.join(' '));
  });
  try {
    await createHarnessCommand()
      .exitOverride()
      .parseAsync(['node', 'harness', ...args]);
  } finally {
    spy.mockRestore();
  }
  return out.join('\n');
}

describe('shep harness', () => {
  beforeEach(() => {
    for (const k of Object.keys(impls)) delete impls[k];
    mockResolve.mockImplementation((cls: { name: string }) => {
      impls[cls.name] ??= { execute: vi.fn() };
      return impls[cls.name];
    });
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('maps run flags to overrides', () => {
    expect(
      runOverrides({
        repo: '.',
        mode: HarnessMode.Baseline,
        maxTurns: '12',
        shadowContextRouter: true,
        shadowToolRouter: true,
      })
    ).toEqual({
      mode: HarnessMode.Baseline,
      maxTurns: 12,
      shadow: { contextRouter: true, toolRouter: true },
    });
  });

  it('run --non-interactive passes interactive=false and prints the result', async () => {
    mockResolve.mockImplementation((cls: { name: string }) => {
      impls[cls.name] ??= { execute: vi.fn().mockResolvedValue(runResult) };
      return impls[cls.name];
    });
    const out = await run(
      'run',
      'Fix refresh',
      '--repo',
      '/repo',
      '--non-interactive',
      '--max-turns',
      '9'
    );

    const input = impls.RunHarnessTaskUseCase.execute.mock.calls[0][0];
    expect(input).toMatchObject({
      task: 'Fix refresh',
      interactive: false,
      overrides: { maxTurns: 9 },
    });
    expect(out).toContain('src/refresh.ts:2-2');
    expect(out).toContain('3 turns · 1.2k in / 80 out · $0.0123');
    expect(out).toContain(`shep harness apply ${session.id}`);
    expect(process.exitCode).toBeUndefined();
  });

  it('run --json prints stable JSON', async () => {
    mockResolve.mockImplementation((cls: { name: string }) => {
      impls[cls.name] ??= { execute: vi.fn().mockResolvedValue(runResult) };
      return impls[cls.name];
    });
    const out = await run('run', 'Fix refresh', '--json');
    expect(Object.keys(JSON.parse(out))).toEqual(['session', 'task', 'result', 'usage']);
    expect(impls.RunHarnessTaskUseCase.execute.mock.calls[0][0].interactive).toBe(false);
  });

  it('sets exitCode=1 and never throws when a use case fails', async () => {
    mockResolve.mockImplementation((cls: { name: string }) => {
      impls[cls.name] ??= { execute: vi.fn().mockRejectedValue(new Error('No API key')) };
      return impls[cls.name];
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await run('apply', 'sess-1', '--branch', 'fix/x');
    err.mockRestore();
    expect(process.exitCode).toBe(1);
  });

  it('apply passes the branch and reports the commit', async () => {
    mockResolve.mockImplementation((cls: { name: string }) => {
      impls[cls.name] ??= {
        execute: vi
          .fn()
          .mockResolvedValue({ branch: 'fix/x', commit: 'abcdef1234567', files: ['a.ts'] }),
      };
      return impls[cls.name];
    });
    await run('apply', 'sess-1', '--branch', 'fix/x');
    expect(impls.ApplyHarnessSessionUseCase.execute).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      branch: 'fix/x',
    });
  });

  it('permissions allow resolves with the scope and note', async () => {
    mockResolve.mockImplementation((cls: { name: string }) => {
      impls[cls.name] ??= {
        execute: vi.fn().mockResolvedValue({
          action: { summary: 'pnpm add jose' },
          result: 'allow',
          scope: GrantScope.Task,
        }),
      };
      return impls[cls.name];
    });
    await run('permissions', 'allow', 'perm-1', '--scope', 'task', '--note', 'ok');
    expect(impls.ResolveHarnessPermissionUseCase.execute).toHaveBeenCalledWith({
      id: 'perm-1',
      allow: true,
      scope: GrantScope.Task,
      note: 'ok',
      resolvedBy: 'cli',
    });
  });

  it('permissions deny never sends a scope', async () => {
    mockResolve.mockImplementation((cls: { name: string }) => {
      impls[cls.name] ??= {
        execute: vi.fn().mockResolvedValue({ action: { summary: 'git push' }, result: 'deny' }),
      };
      return impls[cls.name];
    });
    await run('permissions', 'deny', 'perm-2', '--note', 'Shep pushes later');
    expect(impls.ResolveHarnessPermissionUseCase.execute).toHaveBeenCalledWith({
      id: 'perm-2',
      allow: false,
      note: 'Shep pushes later',
      resolvedBy: 'cli',
    });
  });

  it('init --json without --yes previews and never writes', async () => {
    mockResolve.mockImplementation((cls: { name: string }) => {
      impls[cls.name] ??= {
        execute: vi.fn().mockResolvedValue({
          inspection: { instructionFiles: [], manifests: [], sensitivePaths: [] },
          files: [],
          written: [],
        }),
      };
      return impls[cls.name];
    });
    await run('init', '--repo', '/repo', '--json');
    expect(impls.InitHarnessProjectUseCase.execute).toHaveBeenCalledTimes(1);
    expect(impls.InitHarnessProjectUseCase.execute.mock.calls[0][0]).toMatchObject({
      confirm: false,
    });
  });

  it('ls prints one line per session with pending approvals and the full id other commands take', async () => {
    mockResolve.mockImplementation((cls: { name: string }) => {
      impls[cls.name] ??= {
        execute: vi.fn().mockResolvedValue([{ session, taskCount: 2, pendingPermissions: 1 }]),
      };
      return impls[cls.name];
    });
    const out = await run('ls');
    expect(out).toContain('sess-1234-5678');
    expect(out).toContain('1 awaiting approval');
  });

  it('eval report prints the baseline vs query-aware comparison', async () => {
    const report = {
      run: {
        id: 'run-1',
        suite: 'smoke',
        status: 'completed',
        variants: ['baseline', 'query_aware'],
        repeats: 1,
      },
      results: [
        {
          caseId: 'trim-token',
          variant: 'query_aware',
          repeat: 1,
          success: false,
          error: 'timed out',
        },
      ],
      variants: [],
      comparison: [
        { score: 'success', baseline: 1, queryAware: 0.5, relativeChange: -0.5 },
        { score: 'inputTokens', baseline: 54795, queryAware: 13640, relativeChange: -0.751 },
        { score: 'costUsd' },
      ],
    };
    mockResolve.mockImplementation((cls: { name: string }) => {
      impls[cls.name] ??= { execute: vi.fn().mockResolvedValue(report) };
      return impls[cls.name];
    });
    const out = await run('eval', 'report', 'run-1');
    expect(impls.GetHarnessEvalReportUseCase.execute).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(out).toMatch(/inputTokens\s+54,795\s+13,640\s+-75%/);
    expect(out).toMatch(/success\s+100%\s+50%\s+-50%/);
    expect(out).toContain('trim-token (query_aware #1): timed out');
  });
});
