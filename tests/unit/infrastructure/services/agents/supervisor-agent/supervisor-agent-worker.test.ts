/**
 * SupervisorAgentWorker + SupervisorAgentWorkerRegistry — unit tests
 *
 * Verifies the lazy-start, heartbeat, idle-reap, and event-routing
 * contract documented in task 26 / research perf section.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SupervisorAgentWorker,
  SupervisorAgentWorkerRegistry,
  SUPERVISOR_AGENT_NAME,
} from '@/infrastructure/services/agents/supervisor-agent/supervisor-agent-worker.js';
import { InMemorySupervisorAgent } from '@/infrastructure/adapters/in-memory/in-memory-supervisor-agent.js';
import {
  AgentRunStatus,
  SupervisorAutonomy,
  SupervisorScopeType,
  SupervisorVerdict,
  type SupervisorPolicy,
} from '@/domain/generated/output.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type {
  SupervisorEvent,
  SupervisorGateEvent,
} from '@/application/ports/output/agents/supervisor-agent.interface.js';

function makePolicy(overrides: Partial<SupervisorPolicy> = {}): SupervisorPolicy {
  const now = new Date();
  return {
    id: 'pol-1',
    scopeType: 'app',
    scopeId: 'app-1',
    enabled: true,
    autonomyLevel: SupervisorAutonomy.advisory,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SupervisorPolicy;
}

function gateEvent(): SupervisorGateEvent {
  return {
    kind: 'gate',
    scopeType: 'app',
    scopeId: 'app-1',
    agentRunId: 'run-1',
    gateId: 'plan',
    sourceEventId: 'gate-1',
  };
}

function makeRunRepo(): IAgentRunRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByThreadId: vi.fn().mockResolvedValue(null),
    findLatestByFeatureId: vi.fn().mockResolvedValue(null),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updatePinnedConfig: vi.fn().mockResolvedValue(undefined),
    findRunningByPid: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as IAgentRunRepository;
}

describe('SupervisorAgentWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() persists an AgentRun row with agentName="supervisor"', async () => {
    const runRepo = makeRunRepo();
    const worker = new SupervisorAgentWorker(
      { scopeType: 'app', scopeId: 'app-1', featureId: 'feat-1' },
      {
        supervisorAgent: new InMemorySupervisorAgent(),
        runRepository: runRepo,
        idleTtlMs: 100_000,
      }
    );
    await worker.start();

    expect(runRepo.create).toHaveBeenCalledOnce();
    const created = (runRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.agentName).toBe(SUPERVISOR_AGENT_NAME);
    expect(created.featureId).toBe('feat-1');
    expect(created.status).toBe(AgentRunStatus.running);
    expect(created.id).toBe(worker.runId);
  });

  it('submit() forwards the event to the supervisor agent and invokes onDecision', async () => {
    const runRepo = makeRunRepo();
    const onDecision = vi.fn().mockResolvedValue(undefined);
    const worker = new SupervisorAgentWorker(
      { scopeType: 'app', scopeId: 'app-1' },
      {
        supervisorAgent: new InMemorySupervisorAgent(),
        runRepository: runRepo,
        idleTtlMs: 100_000,
        onDecision,
      }
    );
    await worker.start();

    const decision = await worker.submit(gateEvent(), makePolicy());
    expect(decision.verdict).toBe(SupervisorVerdict.advise);
    expect(onDecision).toHaveBeenCalledOnce();
    const [scope, runId, event, dec] = onDecision.mock.calls[0];
    expect(scope.scopeType).toBe('app');
    expect(scope.scopeId).toBe('app-1');
    expect(runId).toBe(worker.runId);
    expect(event.kind).toBe('gate');
    expect(dec.verdict).toBe(SupervisorVerdict.advise);
  });

  it('heartbeat updates the run row at the configured cadence', async () => {
    const runRepo = makeRunRepo();
    const worker = new SupervisorAgentWorker(
      { scopeType: 'app', scopeId: 'app-1' },
      {
        supervisorAgent: new InMemorySupervisorAgent(),
        runRepository: runRepo,
        heartbeatIntervalMs: 1_000,
        idleTtlMs: 100_000,
      }
    );
    await worker.start();

    const callsBefore = (runRepo.updateStatus as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(2_500);
    const callsAfter = (runRepo.updateStatus as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(callsAfter - callsBefore).toBeGreaterThanOrEqual(2);
    await worker.stop();
  });

  it('reaps itself after idleTtlMs of inactivity and notifies onReaped', async () => {
    const runRepo = makeRunRepo();
    const onReaped = vi.fn().mockResolvedValue(undefined);
    const worker = new SupervisorAgentWorker(
      { scopeType: 'app', scopeId: 'app-1' },
      {
        supervisorAgent: new InMemorySupervisorAgent(),
        runRepository: runRepo,
        heartbeatIntervalMs: 60_000,
        idleTtlMs: 1_000,
        onReaped,
      }
    );
    await worker.start();
    expect(worker.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1_500);

    expect(worker.isRunning()).toBe(false);
    expect(onReaped).toHaveBeenCalledOnce();
    expect(runRepo.updateStatus).toHaveBeenCalledWith(
      worker.runId,
      AgentRunStatus.completed,
      expect.objectContaining({ result: 'reaped' })
    );
  });

  it('submit() resets the idle timer so an active worker is not reaped', async () => {
    const runRepo = makeRunRepo();
    const onReaped = vi.fn().mockResolvedValue(undefined);
    const worker = new SupervisorAgentWorker(
      { scopeType: 'app', scopeId: 'app-1' },
      {
        supervisorAgent: new InMemorySupervisorAgent(),
        runRepository: runRepo,
        heartbeatIntervalMs: 60_000,
        idleTtlMs: 1_000,
        onReaped,
      }
    );
    await worker.start();

    // Advance halfway, submit an event, then advance again — the worker
    // should still be running because the idle timer reset.
    await vi.advanceTimersByTimeAsync(600);
    await worker.submit(gateEvent(), makePolicy());
    await vi.advanceTimersByTimeAsync(600);
    expect(worker.isRunning()).toBe(true);
    expect(onReaped).not.toHaveBeenCalled();

    // Now wait long enough for the idle timer to fire after the last
    // submit and confirm the reaper does fire.
    await vi.advanceTimersByTimeAsync(1_500);
    expect(worker.isRunning()).toBe(false);
    expect(onReaped).toHaveBeenCalledOnce();
  });

  it('submit() before start() throws', async () => {
    const worker = new SupervisorAgentWorker(
      { scopeType: 'app', scopeId: 'app-1' },
      {
        supervisorAgent: new InMemorySupervisorAgent(),
        runRepository: makeRunRepo(),
      }
    );
    await expect(worker.submit(gateEvent(), makePolicy())).rejects.toThrow(/before start/);
  });

  it('stop() is idempotent', async () => {
    const runRepo = makeRunRepo();
    const worker = new SupervisorAgentWorker(
      { scopeType: 'app', scopeId: 'app-1' },
      {
        supervisorAgent: new InMemorySupervisorAgent(),
        runRepository: runRepo,
        idleTtlMs: 100_000,
      }
    );
    await worker.start();
    await worker.stop();
    await worker.stop();
    // updateStatus(completed) should run exactly once after stop()
    const completedCalls = (runRepo.updateStatus as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[1] === AgentRunStatus.completed
    );
    expect(completedCalls).toHaveLength(1);
  });
});

describe('SupervisorAgentWorkerRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a worker lazily on first event for a new scope', async () => {
    const runRepo = makeRunRepo();
    const registry = new SupervisorAgentWorkerRegistry({
      supervisorAgent: new InMemorySupervisorAgent(),
      runRepository: runRepo,
      idleTtlMs: 100_000,
    });

    expect(registry.hasWorker('app', 'app-1', undefined)).toBe(false);
    await registry.submitEvent(gateEvent(), { policy: makePolicy() });
    expect(registry.hasWorker('app', 'app-1', undefined)).toBe(true);
    expect(runRepo.create).toHaveBeenCalledOnce();
    await registry.stopAll();
  });

  it('reuses the warm worker for subsequent events in the same scope', async () => {
    const runRepo = makeRunRepo();
    const registry = new SupervisorAgentWorkerRegistry({
      supervisorAgent: new InMemorySupervisorAgent(),
      runRepository: runRepo,
      idleTtlMs: 100_000,
    });

    await registry.submitEvent(gateEvent(), { policy: makePolicy() });
    await registry.submitEvent(gateEvent(), { policy: makePolicy() });
    await registry.submitEvent(gateEvent(), { policy: makePolicy() });
    expect(runRepo.create).toHaveBeenCalledOnce();
    await registry.stopAll();
  });

  it('starts independent workers for different scopes', async () => {
    const runRepo = makeRunRepo();
    const registry = new SupervisorAgentWorkerRegistry({
      supervisorAgent: new InMemorySupervisorAgent(),
      runRepository: runRepo,
      idleTtlMs: 100_000,
    });

    await registry.submitEvent(gateEvent(), {
      policy: makePolicy({
        scopeType: SupervisorScopeType.app,
        scopeId: 'app-1',
        featureId: undefined,
      }),
    });
    await registry.submitEvent(gateEvent(), {
      policy: makePolicy({
        id: 'pol-2',
        scopeType: SupervisorScopeType.app,
        scopeId: 'app-2',
        featureId: undefined,
      }),
    });
    expect(runRepo.create).toHaveBeenCalledTimes(2);
    expect(registry.hasWorker('app', 'app-1', undefined)).toBe(true);
    expect(registry.hasWorker('app', 'app-2', undefined)).toBe(true);
    await registry.stopAll();
  });

  it('removes a reaped worker from the registry so the next event boots a fresh one', async () => {
    const runRepo = makeRunRepo();
    const registry = new SupervisorAgentWorkerRegistry({
      supervisorAgent: new InMemorySupervisorAgent(),
      runRepository: runRepo,
      heartbeatIntervalMs: 60_000,
      idleTtlMs: 1_000,
    });

    await registry.submitEvent(gateEvent(), { policy: makePolicy() });
    expect(registry.hasWorker('app', 'app-1', undefined)).toBe(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(registry.hasWorker('app', 'app-1', undefined)).toBe(false);

    // A new event after reap should boot a fresh worker.
    await registry.submitEvent(gateEvent(), { policy: makePolicy() });
    expect(registry.hasWorker('app', 'app-1', undefined)).toBe(true);
    expect(runRepo.create).toHaveBeenCalledTimes(2);
    await registry.stopAll();
  });
});

describe('SupervisorAgentWorker integration — full lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a worker, sends one event, asserts decision is published, idles, and gets reaped', async () => {
    const runRepo = makeRunRepo();
    const decisions: { runId: string; event: SupervisorEvent }[] = [];
    const reaped: string[] = [];
    const registry = new SupervisorAgentWorkerRegistry({
      supervisorAgent: new InMemorySupervisorAgent(),
      runRepository: runRepo,
      heartbeatIntervalMs: 60_000,
      idleTtlMs: 1_000,
      onDecision: async (_scope, runId, event) => {
        decisions.push({ runId, event });
      },
      onReaped: async (_scope, runId) => {
        reaped.push(runId);
      },
    });

    const decision = await registry.submitEvent(gateEvent(), { policy: makePolicy() });
    expect(decision.verdict).toBe(SupervisorVerdict.advise);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].event.kind).toBe('gate');

    await vi.advanceTimersByTimeAsync(1_500);
    expect(reaped).toHaveLength(1);
    expect(registry.hasWorker('app', 'app-1', undefined)).toBe(false);
  });
});
