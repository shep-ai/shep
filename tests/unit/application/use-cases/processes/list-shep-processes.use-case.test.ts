/**
 * ListShepProcessesUseCase Unit Tests (spec 144)
 *
 * Builds `shep ps` rows from what Shep recorded: daemon.json and agent run
 * PIDs, joined to their features, with liveness and one batched CPU/memory
 * sample.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListShepProcessesUseCase } from '@/application/use-cases/processes/list-shep-processes.use-case.js';
import {
  AgentRunStatus,
  AgentType,
  ShepProcessKind,
  ShepProcessState,
} from '@/domain/generated/output.js';
import type { AgentRun, Feature } from '@/domain/generated/output.js';
import type { DaemonState } from '@/application/ports/output/services/daemon-service.interface.js';
import type { IProcessStatsProbe } from '@/application/ports/output/services/process-stats-probe.interface.js';

const NOW = new Date('2026-10-24T12:00:00Z');

function run(id: string, status: AgentRunStatus, overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id,
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status,
    prompt: '',
    threadId: `t-${id}`,
    startedAt: new Date('2026-10-24T11:00:00Z'),
    createdAt: new Date('2026-10-24T11:00:00Z'),
    updatedAt: new Date('2026-10-24T11:00:00Z'),
    ...overrides,
  } as AgentRun;
}

describe('ListShepProcessesUseCase', () => {
  let daemon: DaemonState | null;
  let runs: AgentRun[];
  let features: Feature[];
  let alive: Set<number>;
  let stats: { sample: ReturnType<typeof vi.fn<IProcessStatsProbe['sample']>> };
  let useCase: ListShepProcessesUseCase;

  beforeEach(() => {
    daemon = null;
    runs = [];
    features = [];
    alive = new Set();
    stats = {
      sample: vi.fn<IProcessStatsProbe['sample']>(
        async (pids) =>
          new Map(
            pids.map((pid) => [pid, { cpuPercent: pid / 100, rssBytes: pid * 1024, zombie: false }])
          )
      ),
    };
    useCase = new ListShepProcessesUseCase(
      { read: async () => daemon } as never,
      { execute: async () => runs } as never,
      { list: vi.fn(async () => features) } as never,
      { isProcessAlive: (pid: number) => alive.has(pid) },
      stats,
      { execute: (runId: string) => `/home/u/.shep/logs/worker-${runId}.log` } as never,
      { now: () => NOW }
    );
  });

  it('lists a live feature worker with its feature, agent, uptime, CPU, memory and log', async () => {
    runs = [
      run('run-1234567890', AgentRunStatus.running, { pid: 4100, featureId: 'feat-abcdef1234' }),
    ];
    features = [{ id: 'feat-abcdef1234', name: 'Billing UI' } as Feature];
    alive = new Set([4100]);

    const list = await useCase.execute();

    expect(list.generatedAt).toEqual(NOW);
    expect(list.processes).toEqual([
      {
        kind: ShepProcessKind.FeatureAgent,
        pid: 4100,
        state: ShepProcessState.Running,
        cpuPercent: 41,
        rssBytes: 4100 * 1024,
        startedAt: new Date('2026-10-24T11:00:00Z'),
        uptimeMs: 60 * 60_000,
        runId: 'run-1234567890',
        runShortId: 'run-1234',
        runStatus: AgentRunStatus.running,
        agentType: AgentType.ClaudeCode,
        agentName: 'feature-agent',
        featureId: 'feat-abcdef1234',
        featureShortId: 'feat-abc',
        featureName: 'Billing UI',
        logPath: '/home/u/.shep/logs/worker-run-1234567890.log',
      },
    ]);
    expect(list.summary).toEqual({ running: 1, crashed: 0, exited: 0 });
  });

  it('lists the daemon first, with its URL', async () => {
    daemon = { pid: 900, port: 4050, startedAt: '2026-10-24T09:00:00Z' };
    alive = new Set([900, 4100]);
    runs = [run('r1', AgentRunStatus.running, { pid: 4100 })];

    const [first, second] = (await useCase.execute()).processes;

    expect(first).toMatchObject({
      kind: ShepProcessKind.Daemon,
      pid: 900,
      state: ShepProcessState.Running,
      url: 'http://localhost:4050',
      uptimeMs: 3 * 60 * 60_000,
    });
    expect(second).toMatchObject({ kind: ShepProcessKind.AgentRun, pid: 4100 });
  });

  it('marks an active run whose process is gone as crashed, and a stale daemon too', async () => {
    daemon = { pid: 900, port: 4050, startedAt: '2026-10-24T09:00:00Z' };
    runs = [run('r1', AgentRunStatus.running, { pid: 4100 })];

    const processes = (await useCase.execute()).processes;

    expect(processes.map((p) => p.state)).toEqual([
      ShepProcessState.Crashed,
      ShepProcessState.Crashed,
    ]);
    expect(processes[1].uptimeMs).toBeUndefined();
    expect(processes[1].cpuPercent).toBeUndefined();
  });

  it('hides exited runs unless asked for all, and skips runs that never had a process', async () => {
    runs = [
      run('gate', AgentRunStatus.waitingApproval, { pid: 4200 }),
      run('done', AgentRunStatus.completed, { pid: 4300 }),
      run('nopid', AgentRunStatus.pending),
    ];

    expect((await useCase.execute()).processes).toEqual([]);

    const all = await useCase.execute({ includeAll: true });
    expect(all.processes.map((p) => [p.runId, p.state])).toEqual([
      ['gate', ShepProcessState.Exited],
      ['done', ShepProcessState.Exited],
    ]);
    expect(all.summary).toEqual({ running: 0, crashed: 0, exited: 2 });
  });

  it('samples CPU and memory once, for live processes only', async () => {
    daemon = { pid: 900, port: 4050, startedAt: '2026-10-24T09:00:00Z' };
    alive = new Set([900, 4100]);
    runs = [
      run('a', AgentRunStatus.running, { pid: 4100 }),
      run('b', AgentRunStatus.running, { pid: 4200 }),
    ];

    await useCase.execute();

    expect(stats.sample).toHaveBeenCalledTimes(1);
    expect(stats.sample).toHaveBeenCalledWith([900, 4100]);
  });

  it('keeps a live process even when its run says it finished', async () => {
    alive = new Set([4300]);
    runs = [run('done', AgentRunStatus.completed, { pid: 4300 })];

    expect((await useCase.execute()).processes[0]).toMatchObject({
      state: ShepProcessState.Running,
      runStatus: AgentRunStatus.completed,
    });
  });

  it('treats a zombie as gone: kill(pid, 0) answers, but the process has exited', async () => {
    alive = new Set([4100]);
    runs = [run('r1', AgentRunStatus.waitingApproval, { pid: 4100 })];
    stats.sample.mockResolvedValue(
      new Map([[4100, { cpuPercent: 108, rssBytes: 0, zombie: true }]])
    );

    expect((await useCase.execute()).processes).toEqual([]);
    const [row] = (await useCase.execute({ includeAll: true })).processes;
    expect(row).toMatchObject({ state: ShepProcessState.Exited });
    expect(row.cpuPercent).toBeUndefined();
    expect(row.uptimeMs).toBeUndefined();
  });
});
