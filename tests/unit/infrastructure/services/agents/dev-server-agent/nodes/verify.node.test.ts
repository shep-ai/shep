/**
 * verify node unit tests.
 *
 * Polls DeploymentService status until Ready (resultUrl), exit (Stopped or
 * status null → failureReason + log tail), or timeout (TCP probe fallback on
 * plan.expectedPort, else failureReason). Sleep is injectable so no test
 * waits on real timers.
 */

import 'reflect-metadata';
import { createServer, type Server } from 'node:net';
import { describe, it, expect, vi } from 'vitest';
import {
  DeploymentState,
  RunPlanSource,
  type DevServerRunPlan,
} from '@/domain/generated/output.js';
import type { DevServerAgentState } from '@/infrastructure/services/agents/dev-server-agent/state.js';
import {
  createVerifyNode,
  probePortDefault,
  type VerifyNodeDeps,
} from '@/infrastructure/services/agents/dev-server-agent/nodes/verify.node.js';

const READY_URL = 'http://localhost:3000';

function makePlan(overrides: Partial<DevServerRunPlan> = {}): DevServerRunPlan {
  const now = new Date();
  return {
    repoPath: '/repo',
    source: RunPlanSource.Deterministic,
    command: 'pnpm dev',
    cwd: '/repo',
    setupCommands: [],
    configHash: 'hash-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeState(overrides: Partial<DevServerAgentState> = {}): DevServerAgentState {
  return {
    targetId: 'app-1',
    targetType: 'application',
    targetPath: '/repo',
    runPlan: makePlan(),
    infraReady: true,
    depsInstalled: true,
    resultUrl: null,
    failureReason: null,
    remediationAttempts: 0,
    lastErrorTail: [],
    capturedLogs: [],
    degraded: false,
    ...overrides,
  };
}

type StatusSnapshot = { state: DeploymentState; url: string | null } | null;

function makeDeps(overrides: Partial<VerifyNodeDeps> = {}): VerifyNodeDeps {
  return {
    getStatus: vi.fn<(targetId: string) => StatusSnapshot>(() => ({
      state: DeploymentState.Booting,
      url: null,
    })),
    getLogs: vi.fn(() => []),
    sleep: vi.fn(() => Promise.resolve()),
    timeoutMs: 2_000,
    pollIntervalMs: 500,
    log: vi.fn(),
    ...overrides,
  };
}

describe('createVerifyNode', () => {
  it('returns resultUrl when the server is Ready on the first poll (no sleeping)', async () => {
    const deps = makeDeps({
      getStatus: vi.fn(() => ({ state: DeploymentState.Ready, url: READY_URL })),
    });
    const node = createVerifyNode(deps);

    const result = await node(makeState());

    expect(result.resultUrl).toBe(READY_URL);
    expect(result).not.toHaveProperty('failureReason');
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('polls until Ready after N Booting polls', async () => {
    const snapshots: StatusSnapshot[] = [
      { state: DeploymentState.Booting, url: null },
      { state: DeploymentState.Booting, url: null },
      { state: DeploymentState.Ready, url: READY_URL },
    ];
    let call = 0;
    const deps = makeDeps({ getStatus: vi.fn(() => snapshots[call++]) });
    const node = createVerifyNode(deps);

    const result = await node(makeState());

    expect(result.resultUrl).toBe(READY_URL);
    expect(deps.getStatus).toHaveBeenCalledTimes(3);
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledWith(500);
  });

  it('keeps polling when Ready is reported without a url yet', async () => {
    const snapshots: StatusSnapshot[] = [
      { state: DeploymentState.Ready, url: null },
      { state: DeploymentState.Ready, url: READY_URL },
    ];
    let call = 0;
    const deps = makeDeps({ getStatus: vi.fn(() => snapshots[call++]) });
    const node = createVerifyNode(deps);

    const result = await node(makeState());

    expect(result.resultUrl).toBe(READY_URL);
  });

  it('fails with the last 50 log lines when the server is Stopped', async () => {
    const logLines = Array.from({ length: 60 }, (_, i) => ({
      line: `line-${i + 1}`,
      stream: 'stderr',
    }));
    const deps = makeDeps({
      getStatus: vi.fn(() => ({ state: DeploymentState.Stopped, url: null })),
      getLogs: vi.fn(() => logLines),
    });
    const node = createVerifyNode(deps);

    const result = await node(makeState());

    expect(result.failureReason).toBe('Dev server exited before becoming ready');
    expect(result.lastErrorTail).toHaveLength(50);
    expect(result.lastErrorTail![0]).toBe('line-11');
    expect(result.lastErrorTail![49]).toBe('line-60');
    expect(result).not.toHaveProperty('resultUrl');
  });

  it('fails when getStatus returns null (deployment vanished)', async () => {
    const deps = makeDeps({ getStatus: vi.fn(() => null) });
    const node = createVerifyNode(deps);

    const result = await node(makeState());

    expect(result.failureReason).toBe('Dev server exited before becoming ready');
  });

  it('tolerates getLogs returning null on the failure path', async () => {
    const deps = makeDeps({
      getStatus: vi.fn(() => ({ state: DeploymentState.Stopped, url: null })),
      getLogs: vi.fn(() => null),
    });
    const node = createVerifyNode(deps);

    const result = await node(makeState());

    expect(result.failureReason).toBe('Dev server exited before becoming ready');
    expect(result.lastErrorTail).toEqual([]);
  });

  it('falls back to a successful expectedPort probe on timeout', async () => {
    const probePort = vi.fn(() => Promise.resolve(true));
    const deps = makeDeps({ probePort, timeoutMs: 1_000, pollIntervalMs: 500 });
    const node = createVerifyNode(deps);

    const result = await node(makeState({ runPlan: makePlan({ expectedPort: 4321 }) }));

    expect(probePort).toHaveBeenCalledWith(4321);
    expect(result.resultUrl).toBe('http://localhost:4321');
    expect(result).not.toHaveProperty('failureReason');
  });

  it('fails on timeout when the expectedPort probe does not connect', async () => {
    const probePort = vi.fn(() => Promise.resolve(false));
    const logLines = [{ line: 'still compiling...', stream: 'stdout' }];
    const deps = makeDeps({
      probePort,
      timeoutMs: 1_000,
      pollIntervalMs: 500,
      getLogs: vi.fn(() => logLines),
    });
    const node = createVerifyNode(deps);

    const result = await node(makeState({ runPlan: makePlan({ expectedPort: 4321 }) }));

    expect(result.failureReason).toBe('Dev server did not become ready within 1000ms');
    expect(result.lastErrorTail).toEqual(['still compiling...']);
  });

  it('fails on timeout without probing when the plan has no expectedPort', async () => {
    const probePort = vi.fn(() => Promise.resolve(true));
    const deps = makeDeps({ probePort, timeoutMs: 1_000, pollIntervalMs: 500 });
    const node = createVerifyNode(deps);

    const result = await node(makeState({ runPlan: makePlan({ expectedPort: undefined }) }));

    expect(probePort).not.toHaveBeenCalled();
    expect(result.failureReason).toBe('Dev server did not become ready within 1000ms');
  });

  it('passes through immediately when failureReason is already set (start_server failed)', async () => {
    const deps = makeDeps();
    const node = createVerifyNode(deps);

    const result = await node(makeState({ failureReason: 'Failed to spawn dev server: boom' }));

    expect(result).toEqual({});
    expect(deps.getStatus).not.toHaveBeenCalled();
    expect(deps.sleep).not.toHaveBeenCalled();
  });
});

describe('probePortDefault', () => {
  it('resolves true for a listening loopback port', async () => {
    const server: Server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected an AddressInfo');
    }

    try {
      await expect(probePortDefault(address.port)).resolves.toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('resolves false (never throws) for a closed port', async () => {
    const server: Server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected an AddressInfo');
    }
    const closedPort = address.port;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    await expect(probePortDefault(closedPort)).resolves.toBe(false);
  });
});
