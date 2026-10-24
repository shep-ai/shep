// @vitest-environment node

/**
 * `shep ps` command Unit Tests (spec 144)
 *
 * The command only renders: rows come from ListShepProcessesUseCase, stopping
 * goes through StopShepProcessUseCase. It prints a table, JSON, or a table
 * redrawn until ctrl+c.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  createPsCommand,
  type PsCommandOptions,
} from '@/presentation/cli/commands/ps/ps.command.js';
import { initI18n } from '@/presentation/cli/i18n.js';
import {
  AgentRunStatus,
  AgentType,
  ShepProcessKind,
  ShepProcessState,
} from '@/domain/generated/output.js';
import type {
  ShepProcessList,
  ShepProcessRow,
} from '@/application/use-cases/processes/shep-process.types.js';
import type { ListViewConfig } from '@/presentation/cli/ui/list-view.js';
import { symbols } from '@/presentation/cli/ui/symbols.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;
const plain = (text: string) => text.replace(ANSI, '');

const worker: ShepProcessRow = {
  kind: ShepProcessKind.FeatureAgent,
  pid: 4100,
  state: ShepProcessState.Running,
  cpuPercent: 12.5,
  rssBytes: 150 * 1024 * 1024,
  startedAt: new Date('2026-10-24T11:00:00Z'),
  uptimeMs: 65 * 60_000,
  runId: 'run-1234567890',
  runShortId: 'run-1234',
  runStatus: AgentRunStatus.running,
  agentType: AgentType.ClaudeCode,
  featureId: 'feat-abcdef1234',
  featureShortId: 'feat-abc',
  featureName: 'Billing UI',
};

const daemon: ShepProcessRow = {
  kind: ShepProcessKind.Daemon,
  pid: 900,
  state: ShepProcessState.Running,
  url: 'http://localhost:4050',
  uptimeMs: 3 * 60 * 60_000,
};

function listOf(...processes: ShepProcessRow[]): ShepProcessList {
  return {
    generatedAt: new Date('2026-10-24T12:00:00Z'),
    processes,
    summary: {
      running: processes.filter((p) => p.state === ShepProcessState.Running).length,
      crashed: processes.filter((p) => p.state === ShepProcessState.Crashed).length,
      exited: processes.filter((p) => p.state === ShepProcessState.Exited).length,
    },
  };
}

describe('createPsCommand', () => {
  let list: { execute: ReturnType<typeof vi.fn> };
  let stop: { execute: ReturnType<typeof vi.fn> };
  let rendered: ListViewConfig[];
  let out: string[];
  let errors: string[];
  let successes: string[];
  let interactive: boolean;
  let interrupt: () => void;
  let originalExitCode: typeof process.exitCode;

  beforeAll(async () => {
    await initI18n('en');
  });

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = 0;
    list = { execute: vi.fn(async () => listOf(daemon, worker)) };
    stop = {
      execute: vi.fn(async () => ({
        stopped: true,
        message: 'Agent stopped',
        runId: 'run-1234567890',
      })),
    };
    rendered = [];
    out = [];
    errors = [];
    successes = [];
    interactive = true;
    interrupt = () => undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.useRealTimers();
  });

  const command = (overrides: Partial<PsCommandOptions> = {}) =>
    createPsCommand({
      resolveUseCases: () => ({ list, stop }) as never,
      render: (config) => rendered.push(config),
      out: (text) => out.push(text),
      err: (line) => errors.push(line),
      success: (line) => successes.push(line),
      isInteractive: () => interactive,
      waitForInterrupt: () =>
        new Promise<void>((resolve) => {
          interrupt = resolve;
        }),
      environment: () => ({ SHEP_AGENT_RUN_ID: 'run-own' }),
      refreshIntervalMs: 10,
      ...overrides,
    });

  it('renders a table of every process', async () => {
    await command().parseAsync(['node', 'shep']);

    expect(list.execute).toHaveBeenCalledWith({ includeAll: false });
    const [table] = rendered;
    expect(table.columns.map((c) => c.label)).toEqual([
      'KIND',
      'PID',
      'FEATURE',
      'AGENT',
      'STATUS',
      'UP',
      'CPU',
      'MEM',
    ]);
    const [daemonRow, workerRow] = table.rows.map((row) => row.map(plain));
    expect(daemonRow).toEqual([
      'daemon',
      '900',
      'http://localhost:4050',
      '—',
      `${symbols.dot} running`,
      '3h 00m',
      '—',
      '—',
    ]);
    expect(workerRow).toEqual([
      'feature agent',
      '4100',
      'Billing UI feat-abc',
      'Claude Code',
      `${symbols.dot} running`,
      '1h 05m',
      '12.5%',
      '150.0 MB',
    ]);
    expect(plain(out.join(''))).toContain('2 running · 0 crashed · 0 exited');
  });

  it('shows a crashed run and how to resume it, and the run status of an exited one', async () => {
    list.execute.mockResolvedValue(
      listOf(
        { ...worker, state: ShepProcessState.Crashed, cpuPercent: undefined, rssBytes: undefined },
        {
          ...worker,
          pid: 4200,
          state: ShepProcessState.Exited,
          runStatus: AgentRunStatus.waitingApproval,
        }
      )
    );
    await command().parseAsync(['node', 'shep', '--all']);

    expect(list.execute).toHaveBeenCalledWith({ includeAll: true });
    const rows = rendered[0].rows.map((row) => row.map(plain));
    expect(rows[0][4]).toBe(`${symbols.error} crashed`);
    expect(rows[1][4]).toBe(`${symbols.dotEmpty} exited · waiting_approval`);
    expect(plain(out.join(''))).toContain('shep feat resume');
  });

  it('shortens a long feature name so the columns stay aligned', async () => {
    list.execute.mockResolvedValue(
      listOf({ ...worker, featureName: 'Rate limit the public API with per-key quotas' })
    );
    await command().parseAsync(['node', 'shep']);

    const [table] = rendered;
    const cell = plain(table.rows[0][2]);
    expect(cell.length).toBeLessThanOrEqual(table.columns[2].width);
    expect(cell).toMatch(/^Rate limit the publi… feat-abc$/);
    expect(cell.endsWith('feat-abc')).toBe(true);
  });

  it('notes when the OS gave no CPU or memory for a running process', async () => {
    list.execute.mockResolvedValue(
      listOf({ ...worker, cpuPercent: undefined, rssBytes: undefined })
    );
    await command().parseAsync(['node', 'shep']);
    expect(plain(out.join(''))).toContain('CPU and memory are not available');
  });

  it('passes an empty list to the table, which explains --all', async () => {
    list.execute.mockResolvedValue(listOf());
    await command().parseAsync(['node', 'shep']);
    expect(rendered[0].rows).toEqual([]);
    expect(rendered[0].emptyMessage).toContain('--all');
  });

  it('prints JSON without colour', async () => {
    await command().parseAsync(['node', 'shep', '--json']);

    expect(rendered).toEqual([]);
    const text = out.join('');
    expect(text).not.toMatch(ANSI);
    const parsed = JSON.parse(text) as ShepProcessList;
    expect(parsed.processes[1]).toMatchObject({
      kind: 'feature-agent',
      pid: 4100,
      featureName: 'Billing UI',
    });
    expect(parsed.summary.running).toBe(2);
  });

  it('refuses --watch outside an interactive terminal', async () => {
    interactive = false;
    await command().parseAsync(['node', 'shep', '--watch']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('shep ps --json');
    expect(list.execute).not.toHaveBeenCalled();
  });

  it('redraws with --watch until interrupted', async () => {
    const done = command().parseAsync(['node', 'shep', '--watch']);
    await vi.waitFor(() => expect(list.execute.mock.calls.length).toBeGreaterThan(2));
    interrupt();
    await done;

    const calls = list.execute.mock.calls.length;
    expect(out.join('')).toContain('\x1b[2J');
    expect(plain(out.join(''))).toContain('ctrl+c');
    await new Promise((r) => setTimeout(r, 40));
    expect(list.execute.mock.calls.length).toBe(calls);
  });

  it('stops a run with ps stop, passing the caller environment and --force', async () => {
    await command().parseAsync(['node', 'shep', 'stop', 'feat-abc', '--force']);

    expect(stop.execute).toHaveBeenCalledWith('feat-abc', {
      environment: { SHEP_AGENT_RUN_ID: 'run-own' },
      force: true,
    });
    expect(successes.join('\n')).toContain('Stopped run-1234: Agent stopped');
  });

  it('fails ps stop with the reason when nothing was stopped', async () => {
    stop.execute.mockResolvedValue({
      stopped: false,
      message: 'No agent run or feature matches x.',
    });
    await command().parseAsync(['node', 'shep', 'stop', 'x']);
    expect(process.exitCode).toBe(1);
    expect(errors).toEqual(['No agent run or feature matches x.']);
  });
});
