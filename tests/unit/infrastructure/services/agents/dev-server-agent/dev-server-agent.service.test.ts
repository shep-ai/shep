// @vitest-environment node

/**
 * DevServerAgentService Unit Tests (spec 103, task-11)
 *
 * The service orchestrates the dev-server agent graph with a fire-and-track
 * contract: startDevServer() resolves once the run is ACCEPTED (transient
 * Analyzing state set, graph launched) and progress flows through
 * IDeploymentService logs/status.
 *
 * The graph itself is stubbed via the `buildGraph` seam — these tests pin
 * the orchestration contract:
 * - single-flight per targetId (no parallel graphs)
 * - transient Analyzing + start log before returning
 * - graceful degradation when no executor provider is available/working
 * - graph failure → failure log + deployment stopped (never an unhandled
 *   rejection)
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DevServerAgentService,
  type DevServerAgentServiceDeps,
  type DevServerAgentGraphOutcome,
} from '@/infrastructure/services/agents/dev-server-agent/dev-server-agent.service.js';
import type { DevServerAgentGraphDeps } from '@/infrastructure/services/agents/dev-server-agent/types.js';
import type { IDeploymentService } from '@/application/ports/output/services/deployment-service.interface.js';
import type { IDevServerRunPlanRepository } from '@/application/ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { DeploymentState, RunPlanSource } from '@/domain/generated/output.js';

const TARGET_ID = 'feat-1';
const TARGET_PATH = '/repos/acme';
const TARGET_TYPE = 'feature';

const SUCCESS_OUTCOME: DevServerAgentGraphOutcome = {
  resultUrl: 'http://localhost:3000',
  failureReason: null,
};

function createDeploymentServiceMock(): IDeploymentService {
  return {
    setDatabase: vi.fn(),
    recoverAll: vi.fn(),
    start: vi.fn(),
    setTransientState: vi.fn(),
    appendLog: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue(null),
    listAll: vi.fn().mockReturnValue([]),
    stopAll: vi.fn(),
    getLogs: vi.fn().mockReturnValue(null),
    on: vi.fn(),
    off: vi.fn(),
  };
}

function createRunPlanRepositoryMock(): IDevServerRunPlanRepository {
  return {
    findByRepoPath: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
    deleteByRepoPath: vi.fn().mockResolvedValue(undefined),
    stampInstallHash: vi.fn().mockResolvedValue(undefined),
  };
}

interface Harness {
  deps: DevServerAgentServiceDeps;
  service: DevServerAgentService;
  invoke: ReturnType<typeof vi.fn>;
  buildGraph: ReturnType<typeof vi.fn>;
  capturedGraphDeps: () => DevServerAgentGraphDeps;
  executor: IAgentExecutor;
}

function createHarness(overrides: Partial<DevServerAgentServiceDeps> = {}): Harness {
  const executor: IAgentExecutor = {
    execute: vi.fn().mockResolvedValue({ success: true, output: '' }),
  } as unknown as IAgentExecutor;

  const invoke = vi.fn().mockResolvedValue(SUCCESS_OUTCOME);
  const buildGraph = vi.fn((_graphDeps: DevServerAgentGraphDeps) => ({ invoke }));

  const deps: DevServerAgentServiceDeps = {
    deploymentService: createDeploymentServiceMock(),
    runPlanRepository: createRunPlanRepositoryMock(),
    executorProvider: { getExecutor: vi.fn().mockResolvedValue(executor) },
    structuredCaller: { call: vi.fn() },
    buildGraph: buildGraph as unknown as DevServerAgentServiceDeps['buildGraph'],
    ...overrides,
  };

  const service = new DevServerAgentService(deps);
  const capturedGraphDeps = (): DevServerAgentGraphDeps => {
    expect(buildGraph).toHaveBeenCalled();
    return buildGraph.mock.calls[0][0];
  };

  return { deps, service, invoke, buildGraph, capturedGraphDeps, executor };
}

/** Wait until every in-flight run launched by the test has settled. */
async function flushRuns(): Promise<void> {
  // A run chains several awaits (executor resolution, invoke, cleanup,
  // finally) — drain enough macrotask turns to let it fully settle.
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('DevServerAgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('acceptance contract', () => {
    it('returns { state: Analyzing } without awaiting the graph run', async () => {
      const { service, invoke } = createHarness();
      let invokeResolved = false;
      invoke.mockImplementation(
        () =>
          new Promise<DevServerAgentGraphOutcome>((resolve) =>
            setTimeout(() => {
              invokeResolved = true;
              resolve(SUCCESS_OUTCOME);
            }, 5)
          )
      );

      const result = await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);

      expect(result).toEqual({ state: DeploymentState.Analyzing });
      expect(invokeResolved).toBe(false);
      await vi.waitFor(() => expect(invokeResolved).toBe(true));
    });

    it('sets the transient Analyzing state and appends the start log synchronously', async () => {
      const { service, deps } = createHarness();

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);

      expect(deps.deploymentService.setTransientState).toHaveBeenCalledWith(
        TARGET_ID,
        TARGET_PATH,
        TARGET_TYPE,
        DeploymentState.Analyzing
      );
      expect(deps.deploymentService.appendLog).toHaveBeenCalledWith(
        TARGET_ID,
        expect.stringContaining('dev-server agent run started')
      );
      await flushRuns();
    });

    it('invokes the graph with exactly the three target inputs', async () => {
      const { service, invoke } = createHarness();

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await flushRuns();

      expect(invoke).toHaveBeenCalledExactlyOnceWith({
        targetId: TARGET_ID,
        targetType: TARGET_TYPE,
        targetPath: TARGET_PATH,
      });
    });

    it('composes all six graph nodes', async () => {
      const { service, capturedGraphDeps } = createHarness();

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await flushRuns();

      const { nodes } = capturedGraphDeps();
      expect(nodes.analyze).toBeTypeOf('function');
      expect(nodes.ensureInfra).toBeTypeOf('function');
      expect(nodes.installDeps).toBeTypeOf('function');
      expect(nodes.startServer).toBeTypeOf('function');
      expect(nodes.verify).toBeTypeOf('function');
      expect(nodes.remediate).toBeTypeOf('function');
    });
  });

  describe('single-flight per targetId', () => {
    it('coalesces a second start while a run is in flight (no second graph)', async () => {
      const { service, deps, invoke, buildGraph } = createHarness();
      let resolveRun!: (outcome: DevServerAgentGraphOutcome) => void;
      invoke.mockReturnValue(
        new Promise<DevServerAgentGraphOutcome>((resolve) => {
          resolveRun = resolve;
        })
      );

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      vi.mocked(deps.deploymentService.getStatus).mockReturnValue({
        state: DeploymentState.Installing,
        url: null,
      });

      const second = await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);

      expect(second).toEqual({ state: DeploymentState.Installing });
      expect(buildGraph).toHaveBeenCalledTimes(1);
      // No second transient reset either — the running graph owns the state.
      expect(deps.deploymentService.setTransientState).toHaveBeenCalledTimes(1);

      resolveRun(SUCCESS_OUTCOME);
      await flushRuns();
    });

    it('falls back to Analyzing when a coalesced start finds no status', async () => {
      const { service, deps, invoke } = createHarness();
      let resolveRun!: (outcome: DevServerAgentGraphOutcome) => void;
      invoke.mockReturnValue(
        new Promise<DevServerAgentGraphOutcome>((resolve) => {
          resolveRun = resolve;
        })
      );
      vi.mocked(deps.deploymentService.getStatus).mockReturnValue(null);

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      const second = await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);

      expect(second).toEqual({ state: DeploymentState.Analyzing });

      resolveRun(SUCCESS_OUTCOME);
      await flushRuns();
    });

    it('allows a fresh run after the previous one completed', async () => {
      const { service, buildGraph } = createHarness();

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await flushRuns();
      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await flushRuns();

      expect(buildGraph).toHaveBeenCalledTimes(2);
    });

    it('runs different targetIds in parallel (single-flight is per target)', async () => {
      const { service, buildGraph, invoke } = createHarness();
      invoke.mockReturnValue(new Promise<DevServerAgentGraphOutcome>(() => undefined));

      await service.startDevServer('feat-a', TARGET_PATH, TARGET_TYPE);
      await service.startDevServer('feat-b', TARGET_PATH, TARGET_TYPE);

      // buildGraph happens after the async executor resolution — wait for it.
      await vi.waitFor(() => expect(buildGraph).toHaveBeenCalledTimes(2));
    });
  });

  describe('run completion', () => {
    it('appends a success log (with the url) and does NOT stop the deployment', async () => {
      const { service, deps } = createHarness();

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await flushRuns();

      expect(deps.deploymentService.appendLog).toHaveBeenCalledWith(
        TARGET_ID,
        expect.stringContaining('http://localhost:3000')
      );
      expect(deps.deploymentService.stop).not.toHaveBeenCalled();
    });

    it('appends the failure reason verbatim and stops the deployment on graph failure', async () => {
      const { service, deps, invoke } = createHarness();
      invoke.mockResolvedValue({
        resultUrl: null,
        failureReason: 'Dev server did not become ready within 90000ms',
      });

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await vi.waitFor(() => expect(deps.deploymentService.stop).toHaveBeenCalledWith(TARGET_ID));

      expect(deps.deploymentService.appendLog).toHaveBeenCalledWith(
        TARGET_ID,
        'Dev server did not become ready within 90000ms'
      );
    });

    it('handles an unexpected graph rejection: failure log + stop, no unhandled rejection', async () => {
      const { service, deps, invoke } = createHarness();
      invoke.mockRejectedValue(new Error('checkpoint corrupted'));

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await vi.waitFor(() => expect(deps.deploymentService.stop).toHaveBeenCalledWith(TARGET_ID));

      expect(deps.deploymentService.appendLog).toHaveBeenCalledWith(
        TARGET_ID,
        expect.stringContaining('checkpoint corrupted')
      );
    });

    it('swallows stop() errors during failure cleanup', async () => {
      const { service, deps, invoke, buildGraph } = createHarness();
      invoke.mockResolvedValue({ resultUrl: null, failureReason: 'boom' });
      vi.mocked(deps.deploymentService.stop).mockRejectedValue(new Error('stop exploded'));

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await flushRuns();

      // The in-flight slot is released even when cleanup failed.
      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await vi.waitFor(() => expect(buildGraph).toHaveBeenCalledTimes(2));
      await flushRuns();
    });
  });

  describe('graceful degradation (no executor)', () => {
    async function assertRemediateDegraded(harness: Harness): Promise<void> {
      const { service, deps, capturedGraphDeps } = harness;

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await flushRuns();

      const { nodes } = capturedGraphDeps();
      const update = await nodes.remediate({
        targetId: TARGET_ID,
        targetType: TARGET_TYPE,
        targetPath: TARGET_PATH,
        runPlan: null,
        infraReady: false,
        depsInstalled: false,
        resultUrl: null,
        failureReason: 'install failed',
        remediationAttempts: 0,
        lastErrorTail: [],
        capturedLogs: [],
        degraded: false,
      });

      expect(update.degraded).toBe(true);
      expect(update.failureReason).toBeUndefined(); // left set — terminal
      expect(deps.deploymentService.appendLog).toHaveBeenCalledWith(
        TARGET_ID,
        expect.stringContaining('no agent available for remediation')
      );
    }

    it('wires a null executor when no provider is configured', async () => {
      await assertRemediateDegraded(createHarness({ executorProvider: null }));
    });

    it('wires a null executor when the provider throws', async () => {
      await assertRemediateDegraded(
        createHarness({
          executorProvider: { getExecutor: vi.fn().mockRejectedValue(new Error('no agent')) },
        })
      );
    });

    it('wires the resolved executor into remediation when the provider works', async () => {
      const { service, executor, capturedGraphDeps } = createHarness();

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await flushRuns();

      const { nodes } = capturedGraphDeps();
      await nodes.remediate({
        targetId: TARGET_ID,
        targetType: TARGET_TYPE,
        targetPath: TARGET_PATH,
        runPlan: null,
        infraReady: false,
        depsInstalled: false,
        resultUrl: null,
        failureReason: 'install failed',
        remediationAttempts: 0,
        lastErrorTail: [],
        capturedLogs: [],
        degraded: false,
      });

      expect(executor.execute).toHaveBeenCalled();
    });
  });

  describe('state bridging into the graph nodes', () => {
    it('bridges reportInstalling to setTransientState(Installing)', async () => {
      const { service, deps, capturedGraphDeps } = createHarness();

      await service.startDevServer(TARGET_ID, TARGET_PATH, TARGET_TYPE);
      await flushRuns();
      vi.mocked(deps.deploymentService.setTransientState).mockClear();

      const { nodes } = capturedGraphDeps();
      const now = new Date();
      await nodes.installDeps({
        targetId: TARGET_ID,
        targetType: TARGET_TYPE,
        targetPath: TARGET_PATH,
        // No packageManager and no setupCommands — the node reports
        // Installing then completes without touching any real process.
        runPlan: {
          repoPath: TARGET_PATH,
          source: RunPlanSource.Deterministic,
          command: 'npm run dev',
          cwd: TARGET_PATH,
          setupCommands: [],
          configHash: 'hash',
          createdAt: now,
          updatedAt: now,
        },
        infraReady: true,
        depsInstalled: false,
        resultUrl: null,
        failureReason: null,
        remediationAttempts: 0,
        lastErrorTail: [],
        capturedLogs: [],
        degraded: false,
      });

      expect(deps.deploymentService.setTransientState).toHaveBeenCalledWith(
        TARGET_ID,
        TARGET_PATH,
        TARGET_TYPE,
        DeploymentState.Installing
      );
    });
  });
});
