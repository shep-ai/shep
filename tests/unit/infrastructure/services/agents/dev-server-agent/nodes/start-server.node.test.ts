/**
 * start_server node unit tests.
 *
 * The node passes the resolved run plan VERBATIM to DeploymentService.start
 * (no re-detection concepts anywhere near it), logs the exact command before
 * spawning (security requirement: the executed command must be inspectable
 * in the SSE log), and converts spawn throws into a failureReason.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { RunPlanSource, type DevServerRunPlan } from '@/domain/generated/output.js';
import type { DevServerAgentState } from '@/infrastructure/services/agents/dev-server-agent/state.js';
import {
  createStartServerNode,
  type StartServerNodeDeps,
} from '@/infrastructure/services/agents/dev-server-agent/nodes/start-server.node.js';

function makePlan(overrides: Partial<DevServerRunPlan> = {}): DevServerRunPlan {
  const now = new Date();
  return {
    repoPath: '/repo',
    source: RunPlanSource.Deterministic,
    command: 'pnpm dev',
    cwd: '/repo/apps/web',
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

function makeDeps(overrides: Partial<StartServerNodeDeps> = {}): StartServerNodeDeps {
  return {
    deploymentService: { start: vi.fn() },
    log: vi.fn(),
    ...overrides,
  };
}

describe('createStartServerNode', () => {
  it('passes the run plan verbatim to DeploymentService.start (no detection concepts)', async () => {
    const deps = makeDeps();
    const node = createStartServerNode(deps);
    const state = makeState();

    await node(state);

    expect(deps.deploymentService.start).toHaveBeenCalledTimes(1);
    expect(deps.deploymentService.start).toHaveBeenCalledWith('app-1', '/repo', 'application', {
      runPlan: { command: 'pnpm dev', cwd: '/repo/apps/web' },
    });
  });

  it('returns only capturedLogs on success (no other state channels)', async () => {
    const deps = makeDeps();
    const node = createStartServerNode(deps);

    const result = await node(makeState());

    expect(result.capturedLogs).toBeDefined();
    expect(result.capturedLogs!.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('failureReason');
    expect(result).not.toHaveProperty('resultUrl');
    expect(result).not.toHaveProperty('runPlan');
    expect(result).not.toHaveProperty('remediationAttempts');
  });

  it('logs the exact command verbatim BEFORE spawning', async () => {
    const deps = makeDeps();
    const node = createStartServerNode(deps);

    await node(makeState());

    const expectedLine = 'starting dev server: pnpm dev (cwd: /repo/apps/web)';
    expect(deps.log).toHaveBeenCalledWith(expectedLine);
    const logOrder = vi.mocked(deps.log).mock.invocationCallOrder[0];
    const startOrder = vi.mocked(deps.deploymentService.start).mock.invocationCallOrder[0];
    expect(logOrder).toBeLessThan(startOrder);
  });

  it('includes the verbatim command line in capturedLogs', async () => {
    const deps = makeDeps();
    const node = createStartServerNode(deps);

    const result = await node(makeState());

    expect(result.capturedLogs).toContain('starting dev server: pnpm dev (cwd: /repo/apps/web)');
  });

  it('guards against a null run plan without calling start', async () => {
    const deps = makeDeps();
    const node = createStartServerNode(deps);

    const result = await node(makeState({ runPlan: null }));

    expect(deps.deploymentService.start).not.toHaveBeenCalled();
    expect(result.failureReason).toBeDefined();
    expect(result.failureReason).not.toBeNull();
  });

  it('converts a spawn throw into failureReason', async () => {
    const deps = makeDeps({
      deploymentService: {
        start: vi.fn(() => {
          throw new Error('spawn ENOENT');
        }),
      },
    });
    const node = createStartServerNode(deps);

    const result = await node(makeState());

    expect(result.failureReason).toBe('Failed to spawn dev server: spawn ENOENT');
    expect(result).not.toHaveProperty('resultUrl');
  });

  it('stringifies non-Error throws into failureReason', async () => {
    const deps = makeDeps({
      deploymentService: {
        start: vi.fn(() => {
          throw 'boom';
        }),
      },
    });
    const node = createStartServerNode(deps);

    const result = await node(makeState());

    expect(result.failureReason).toBe('Failed to spawn dev server: boom');
  });
});
