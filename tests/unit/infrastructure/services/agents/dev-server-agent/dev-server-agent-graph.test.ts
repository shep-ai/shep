/**
 * Dev-server agent graph — structure and routing unit tests.
 *
 * Drives the compiled graph with stub nodes (the real node factories are
 * built in later tasks) and pins the exact node set, edge routing, and
 * bounded-remediation semantics.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { END } from '@langchain/langgraph';
import {
  RunPlanSource,
  type DevServerRunPlan,
  DeploymentTargetType,
} from '@/domain/generated/output.js';
import { createCheckpointer } from '@/infrastructure/services/agents/common/checkpointer.js';
import type { DevServerAgentState } from '@/infrastructure/services/agents/dev-server-agent/state.js';
import type {
  DevServerAgentGraphNodes,
  DevServerAgentNodeResult,
} from '@/infrastructure/services/agents/dev-server-agent/types.js';
import {
  createDevServerAgentGraph,
  DevServerAgentNodeName,
  MAX_REMEDIATION_ATTEMPTS,
  routeAfterAnalyze,
  routeAfterEnsureInfra,
  routeAfterInstallDeps,
  routeAfterVerify,
} from '@/infrastructure/services/agents/dev-server-agent/dev-server-agent-graph.js';

const RESULT_URL = 'http://localhost:3000';

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
    targetType: DeploymentTargetType.Application,
    targetPath: '/repo',
    runPlan: null,
    infraReady: false,
    depsInstalled: false,
    resultUrl: null,
    failureReason: null,
    remediationAttempts: 0,
    lastErrorTail: [],
    capturedLogs: [],
    degraded: false,
    ...overrides,
  };
}

const INITIAL_INPUT = {
  targetId: 'app-1',
  targetType: DeploymentTargetType.Application,
  targetPath: '/repo',
};

/**
 * Happy-path stub nodes. Each records its invocation order and appends a
 * capturedLogs line so accumulation across nodes is observable.
 */
function makeStubNodes(callOrder: string[]): DevServerAgentGraphNodes {
  return {
    analyze: vi.fn(async (): Promise<DevServerAgentNodeResult> => {
      callOrder.push(DevServerAgentNodeName.Analyze);
      return { runPlan: makePlan(), capturedLogs: ['analyze: plan resolved'] };
    }),
    ensureInfra: vi.fn(async (): Promise<DevServerAgentNodeResult> => {
      callOrder.push(DevServerAgentNodeName.EnsureInfra);
      return { infraReady: true, capturedLogs: ['ensure_infra: binaries present'] };
    }),
    installDeps: vi.fn(async (): Promise<DevServerAgentNodeResult> => {
      callOrder.push(DevServerAgentNodeName.InstallDeps);
      return { depsInstalled: true, capturedLogs: ['install_deps: installed'] };
    }),
    startServer: vi.fn(async (): Promise<DevServerAgentNodeResult> => {
      callOrder.push(DevServerAgentNodeName.StartServer);
      return { capturedLogs: ['start_server: spawned'] };
    }),
    verify: vi.fn(async (): Promise<DevServerAgentNodeResult> => {
      callOrder.push(DevServerAgentNodeName.Verify);
      return { resultUrl: RESULT_URL, capturedLogs: ['verify: ready'] };
    }),
    remediate: vi.fn(async (state: DevServerAgentState): Promise<DevServerAgentNodeResult> => {
      callOrder.push(DevServerAgentNodeName.Remediate);
      return {
        failureReason: null,
        remediationAttempts: state.remediationAttempts + 1,
        capturedLogs: ['remediate: attempted fix'],
      };
    }),
  };
}

describe('DevServerAgentNodeName', () => {
  it('exposes the six node names', () => {
    expect(DevServerAgentNodeName).toEqual({
      Analyze: 'analyze',
      EnsureInfra: 'ensure_infra',
      InstallDeps: 'install_deps',
      StartServer: 'start_server',
      Verify: 'verify',
      Remediate: 'remediate',
    });
  });
});

describe('MAX_REMEDIATION_ATTEMPTS', () => {
  it('is 2', () => {
    expect(MAX_REMEDIATION_ATTEMPTS).toBe(2);
  });
});

describe('route helpers', () => {
  describe('routeAfterAnalyze', () => {
    it('routes to ensure_infra when analysis succeeded', () => {
      expect(routeAfterAnalyze(makeState({ runPlan: makePlan() }))).toBe(
        DevServerAgentNodeName.EnsureInfra
      );
    });

    it('routes to END when analysis failed', () => {
      expect(routeAfterAnalyze(makeState({ failureReason: 'not deployable' }))).toBe(END);
    });
  });

  describe('routeAfterEnsureInfra', () => {
    it('routes to install_deps when infra is ready', () => {
      expect(routeAfterEnsureInfra(makeState({ infraReady: true }))).toBe(
        DevServerAgentNodeName.InstallDeps
      );
    });

    it('routes to END when infra could not be ensured', () => {
      expect(routeAfterEnsureInfra(makeState({ failureReason: 'pnpm missing' }))).toBe(END);
    });
  });

  describe('routeAfterInstallDeps', () => {
    it('routes to start_server on success', () => {
      expect(routeAfterInstallDeps(makeState({ depsInstalled: true }))).toBe(
        DevServerAgentNodeName.StartServer
      );
    });

    it('routes to remediate on failure while attempts remain', () => {
      expect(
        routeAfterInstallDeps(
          makeState({ failureReason: 'install failed', remediationAttempts: 0 })
        )
      ).toBe(DevServerAgentNodeName.Remediate);
      expect(
        routeAfterInstallDeps(
          makeState({
            failureReason: 'install failed',
            remediationAttempts: MAX_REMEDIATION_ATTEMPTS - 1,
          })
        )
      ).toBe(DevServerAgentNodeName.Remediate);
    });

    it('routes to END on failure once attempts are exhausted', () => {
      expect(
        routeAfterInstallDeps(
          makeState({
            failureReason: 'install failed',
            remediationAttempts: MAX_REMEDIATION_ATTEMPTS,
          })
        )
      ).toBe(END);
    });
  });

  describe('routeAfterVerify', () => {
    it('routes to END when the server is verified (resultUrl set)', () => {
      expect(routeAfterVerify(makeState({ resultUrl: RESULT_URL }))).toBe(END);
    });

    it('routes to remediate on failure while attempts remain', () => {
      expect(
        routeAfterVerify(makeState({ failureReason: 'timeout', remediationAttempts: 0 }))
      ).toBe(DevServerAgentNodeName.Remediate);
      expect(
        routeAfterVerify(
          makeState({ failureReason: 'timeout', remediationAttempts: MAX_REMEDIATION_ATTEMPTS - 1 })
        )
      ).toBe(DevServerAgentNodeName.Remediate);
    });

    it('routes to END on failure once attempts are exhausted', () => {
      expect(
        routeAfterVerify(
          makeState({ failureReason: 'timeout', remediationAttempts: MAX_REMEDIATION_ATTEMPTS })
        )
      ).toBe(END);
    });
  });
});

describe('createDevServerAgentGraph', () => {
  it('pins the exact node set', () => {
    const graph = createDevServerAgentGraph({ nodes: makeStubNodes([]) });
    const drawable = graph.getGraph();
    const nodeIds = Object.keys(drawable.nodes).sort();
    expect(nodeIds).toEqual(
      [
        '__start__',
        '__end__',
        DevServerAgentNodeName.Analyze,
        DevServerAgentNodeName.EnsureInfra,
        DevServerAgentNodeName.InstallDeps,
        DevServerAgentNodeName.StartServer,
        DevServerAgentNodeName.Verify,
        DevServerAgentNodeName.Remediate,
      ].sort()
    );
  });

  it('happy path: runs analyze → ensure_infra → install_deps → start_server → verify and ends with resultUrl', async () => {
    const callOrder: string[] = [];
    const nodes = makeStubNodes(callOrder);
    const graph = createDevServerAgentGraph({ nodes });

    const result = await graph.invoke(INITIAL_INPUT);

    expect(callOrder).toEqual([
      DevServerAgentNodeName.Analyze,
      DevServerAgentNodeName.EnsureInfra,
      DevServerAgentNodeName.InstallDeps,
      DevServerAgentNodeName.StartServer,
      DevServerAgentNodeName.Verify,
    ]);
    expect(nodes.remediate).not.toHaveBeenCalled();
    expect(result.resultUrl).toBe(RESULT_URL);
    expect(result.failureReason).toBeNull();
    // capturedLogs accumulates across nodes while scalars last-write-win.
    expect(result.capturedLogs).toEqual([
      'analyze: plan resolved',
      'ensure_infra: binaries present',
      'install_deps: installed',
      'start_server: spawned',
      'verify: ready',
    ]);
    expect(result.infraReady).toBe(true);
    expect(result.depsInstalled).toBe(true);
    expect(result.remediationAttempts).toBe(0);
  });

  it('analyze failure short-circuits to END — no later node runs', async () => {
    const nodes = makeStubNodes([]);
    (nodes.analyze as ReturnType<typeof vi.fn>).mockImplementation(
      async (): Promise<DevServerAgentNodeResult> => ({
        failureReason: 'repository is not deployable',
      })
    );
    const graph = createDevServerAgentGraph({ nodes });

    const result = await graph.invoke(INITIAL_INPUT);

    expect(result.failureReason).toBe('repository is not deployable');
    expect(result.resultUrl).toBeNull();
    expect(nodes.ensureInfra).not.toHaveBeenCalled();
    expect(nodes.installDeps).not.toHaveBeenCalled();
    expect(nodes.startServer).not.toHaveBeenCalled();
    expect(nodes.verify).not.toHaveBeenCalled();
    expect(nodes.remediate).not.toHaveBeenCalled();
  });

  it('ensure_infra failure short-circuits to END — no later node runs', async () => {
    const nodes = makeStubNodes([]);
    (nodes.ensureInfra as ReturnType<typeof vi.fn>).mockImplementation(
      async (): Promise<DevServerAgentNodeResult> => ({
        failureReason: 'pnpm is missing; run: corepack enable pnpm',
      })
    );
    const graph = createDevServerAgentGraph({ nodes });

    const result = await graph.invoke(INITIAL_INPUT);

    expect(result.failureReason).toContain('pnpm is missing');
    expect(nodes.installDeps).not.toHaveBeenCalled();
    expect(nodes.startServer).not.toHaveBeenCalled();
    expect(nodes.verify).not.toHaveBeenCalled();
    expect(nodes.remediate).not.toHaveBeenCalled();
  });

  it('install failure routes to remediate, loops back to ensure_infra, and succeeds on retry', async () => {
    const callOrder: string[] = [];
    const nodes = makeStubNodes(callOrder);
    (nodes.installDeps as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (): Promise<DevServerAgentNodeResult> => {
        callOrder.push(DevServerAgentNodeName.InstallDeps);
        return {
          failureReason: 'pnpm install exited with code 1',
          lastErrorTail: ['ERR_PNPM_FETCH'],
        };
      }
    );
    const graph = createDevServerAgentGraph({ nodes });

    const result = await graph.invoke(INITIAL_INPUT);

    expect(callOrder).toEqual([
      DevServerAgentNodeName.Analyze,
      DevServerAgentNodeName.EnsureInfra,
      DevServerAgentNodeName.InstallDeps,
      DevServerAgentNodeName.Remediate,
      DevServerAgentNodeName.EnsureInfra,
      DevServerAgentNodeName.InstallDeps,
      DevServerAgentNodeName.StartServer,
      DevServerAgentNodeName.Verify,
    ]);
    expect(result.resultUrl).toBe(RESULT_URL);
    expect(result.failureReason).toBeNull();
    expect(result.remediationAttempts).toBe(1);
  });

  it('remediate clears failureReason before looping back', async () => {
    const nodes = makeStubNodes([]);
    (nodes.installDeps as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (): Promise<DevServerAgentNodeResult> => ({
        failureReason: 'install failed',
      })
    );
    const graph = createDevServerAgentGraph({ nodes });

    await graph.invoke(INITIAL_INPUT);

    // The second ensure_infra invocation (post-remediation) must see a
    // cleared failureReason and the incremented attempt counter.
    const ensureInfraCalls = (nodes.ensureInfra as ReturnType<typeof vi.fn>).mock.calls;
    expect(ensureInfraCalls).toHaveLength(2);
    const stateAfterRemediate = ensureInfraCalls[1][0] as DevServerAgentState;
    expect(stateAfterRemediate.failureReason).toBeNull();
    expect(stateAfterRemediate.remediationAttempts).toBe(1);
  });

  it('persistent verify failure loops via remediate at most MAX times then ENDs with failureReason', async () => {
    const nodes = makeStubNodes([]);
    (nodes.verify as ReturnType<typeof vi.fn>).mockImplementation(
      async (): Promise<DevServerAgentNodeResult> => ({
        failureReason: 'timed out waiting for the dev server to become ready',
      })
    );
    const graph = createDevServerAgentGraph({ nodes });

    const result = await graph.invoke(INITIAL_INPUT);

    // verify runs MAX + 1 times (initial pass + one per remediation attempt).
    expect(nodes.verify).toHaveBeenCalledTimes(MAX_REMEDIATION_ATTEMPTS + 1);
    expect(nodes.remediate).toHaveBeenCalledTimes(MAX_REMEDIATION_ATTEMPTS);
    expect(result.failureReason).toBe('timed out waiting for the dev server to become ready');
    expect(result.resultUrl).toBeNull();
    expect(result.remediationAttempts).toBe(MAX_REMEDIATION_ATTEMPTS);
  });

  it('install failure with attempts already exhausted goes straight to END', async () => {
    const nodes = makeStubNodes([]);
    (nodes.installDeps as ReturnType<typeof vi.fn>).mockImplementation(
      async (): Promise<DevServerAgentNodeResult> => ({
        failureReason: 'install failed',
      })
    );
    const graph = createDevServerAgentGraph({ nodes });

    const result = await graph.invoke({
      ...INITIAL_INPUT,
      remediationAttempts: MAX_REMEDIATION_ATTEMPTS,
    });

    expect(nodes.remediate).not.toHaveBeenCalled();
    expect(nodes.startServer).not.toHaveBeenCalled();
    expect(result.failureReason).toBe('install failed');
  });

  it('compiles and runs with a SqliteSaver checkpointer', async () => {
    const checkpointer = createCheckpointer(':memory:');
    const graph = createDevServerAgentGraph({ nodes: makeStubNodes([]) }, checkpointer);

    const result = await graph.invoke(INITIAL_INPUT, {
      configurable: { thread_id: 'dev-server:app-1' },
    });

    expect(result.resultUrl).toBe(RESULT_URL);
  });

  it('compiles and runs without a checkpointer', async () => {
    const graph = createDevServerAgentGraph({ nodes: makeStubNodes([]) });
    const result = await graph.invoke(INITIAL_INPUT);
    expect(result.resultUrl).toBe(RESULT_URL);
  });
});
