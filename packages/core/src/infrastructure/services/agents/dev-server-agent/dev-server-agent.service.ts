/**
 * DevServerAgentService — orchestrates the dev-server agent graph
 * (spec 103, task-11).
 *
 * Implements the {@link IDevServerAgentService} port with a fire-and-track
 * contract: `startDevServer()` resolves once the run is ACCEPTED — the
 * transient Analyzing state is set on the deployment service and the graph
 * has been launched — never when the server is ready. Progress streams
 * through `IDeploymentService.getStatus()/getLogs()` and the 'log' event
 * (SSE), exactly like the historical Booting contract.
 *
 * Responsibilities:
 * - Single-flight per targetId: a second start while a run is in flight is
 *   coalesced (returns the target's current state, no parallel graph).
 * - Lazy executor resolution with graceful degradation: a missing or
 *   throwing `IAgentExecutorProvider` wires `null` executors into the
 *   nodes, so the graph runs deterministic-only instead of failing.
 * - Node composition: bridges every node's logging/state callbacks onto
 *   the deployment service for the specific target.
 * - Failure routing: a terminal `failureReason` (or an unexpected graph
 *   rejection) is appended to the deployment logs and the deployment is
 *   stopped — a run NEVER surfaces as an unhandled rejection.
 *
 * This subsystem avoids tsyringe decorators — deps are hand-injected and
 * DI wiring happens via a useFactory in register-deployment.ts (task-12).
 */

import { existsSync } from 'node:fs';
import { DeploymentState, type DeploymentTargetType } from '@/domain/generated/output.js';
import type { IDeploymentService } from '@/application/ports/output/services/deployment-service.interface.js';
import type {
  IDevServerAgentService,
  DevServerStartResult,
} from '@/application/ports/output/services/dev-server-agent-service.interface.js';
import type { IDevServerRunPlanRepository } from '@/application/ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IStructuredAgentCaller } from '@/application/ports/output/agents/structured-agent-caller.interface.js';
import { DependencyInstaller } from '@/infrastructure/services/deployment/dependency-installer.js';
import { detectDevScript } from '@/infrastructure/services/deployment/detect-dev-script.js';
import {
  computeConfigHash,
  computeInstallHash,
} from '@/infrastructure/services/deployment/config-hash.js';
import { createDevServerAgentGraph } from './dev-server-agent-graph.js';
import type { DevServerAgentGraphDeps, DevServerAgentGraphNodes } from './types.js';
import { createAnalyzeNode } from './nodes/analyze.node.js';
import { createEnsureInfraNode } from './nodes/ensure-infra.node.js';
import { createInstallDepsNode } from './nodes/install-deps.node.js';
import { createStartServerNode } from './nodes/start-server.node.js';
import { createVerifyNode } from './nodes/verify.node.js';
import { createRemediateNode } from './nodes/remediate.node.js';

/** First synthetic log line of every accepted run. */
const RUN_STARTED_LOG = 'dev-server agent run started';

/**
 * The slice of the final graph state the service acts on. The compiled
 * LangGraph satisfies this structurally; tests stub it with a plain object.
 */
export interface DevServerAgentGraphOutcome {
  resultUrl: string | null;
  failureReason: string | null;
}

/** Minimal runnable-graph contract consumed by the service. */
export interface DevServerAgentGraphRunner {
  invoke(input: {
    targetId: string;
    targetType: DeploymentTargetType;
    targetPath: string;
  }): Promise<DevServerAgentGraphOutcome>;
}

/** Dependencies for {@link DevServerAgentService} (hand-injected). */
export interface DevServerAgentServiceDeps {
  deploymentService: IDeploymentService;
  runPlanRepository: IDevServerRunPlanRepository;
  /** null = no agent configured — runs degrade to deterministic-only. */
  executorProvider: IAgentExecutorProvider | null;
  /** null = no structured analysis available (deterministic-only analyze). */
  structuredCaller: IStructuredAgentCaller | null;
  /** Test seam — defaults to {@link createDevServerAgentGraph} (no checkpointer). */
  buildGraph?: (graphDeps: DevServerAgentGraphDeps) => DevServerAgentGraphRunner;
  /** Test seam — defaults to a fresh {@link DependencyInstaller}. */
  installer?: Pick<DependencyInstaller, 'install'>;
}

export class DevServerAgentService implements IDevServerAgentService {
  /** In-flight run per targetId — the single-flight registry. */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly deps: DevServerAgentServiceDeps) {}

  async startDevServer(
    targetId: string,
    targetPath: string,
    targetType: DeploymentTargetType
  ): Promise<DevServerStartResult> {
    if (this.inFlight.has(targetId)) {
      // Coalesce: the running graph owns the lifecycle — just report where
      // the target currently is.
      const state =
        this.deps.deploymentService.getStatus(targetId)?.state ?? DeploymentState.Analyzing;
      return { state };
    }

    // Accept the run synchronously so polling/SSE see progress immediately.
    this.deps.deploymentService.setTransientState(
      targetId,
      targetPath,
      targetType,
      DeploymentState.Analyzing
    );
    this.deps.deploymentService.appendLog(targetId, RUN_STARTED_LOG);

    // Fire-and-track: launch, register, and release the slot on settle.
    // runGraph() never rejects, so this promise can never leak an
    // unhandled rejection.
    const run = this.runGraph(targetId, targetPath, targetType).finally(() => {
      this.inFlight.delete(targetId);
    });
    this.inFlight.set(targetId, run);

    return { state: DeploymentState.Analyzing };
  }

  /** Execute one full graph run for a target. Never rejects. */
  private async runGraph(
    targetId: string,
    targetPath: string,
    targetType: DeploymentTargetType
  ): Promise<void> {
    const log = (line: string): void => this.deps.deploymentService.appendLog(targetId, line);

    try {
      const executor = await this.resolveExecutor();
      const nodes = this.composeNodes(targetId, targetPath, targetType, executor, log);
      const buildGraph = this.deps.buildGraph ?? createDevServerAgentGraph;
      const graph = buildGraph({ nodes });

      const outcome = await graph.invoke({ targetId, targetType, targetPath });

      if (outcome.failureReason !== null) {
        // Verbatim — the graph already shaped an actionable reason.
        await this.failRun(targetId, outcome.failureReason, log);
        return;
      }
      if (outcome.resultUrl !== null) {
        log(`dev-server agent run succeeded — ${outcome.resultUrl}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.failRun(targetId, `dev-server agent run failed unexpectedly: ${message}`, log);
    }
  }

  /**
   * Terminal failure path: surface the reason in the deployment logs, then
   * stop the deployment to clear transient/Booting leftovers. Stop errors
   * are swallowed — cleanup must never mask the original failure.
   */
  private async failRun(
    targetId: string,
    reason: string,
    log: (line: string) => void
  ): Promise<void> {
    log(reason);
    try {
      await this.deps.deploymentService.stop(targetId);
    } catch {
      // Best-effort cleanup — the failure is already logged.
    }
  }

  /**
   * Resolve the remediation executor lazily. Any provider failure (or no
   * provider at all) degrades to null — deterministic-only operation.
   */
  private async resolveExecutor(): Promise<IAgentExecutor | null> {
    const provider = this.deps.executorProvider;
    if (!provider) return null;
    try {
      return await provider.getExecutor();
    } catch {
      return null;
    }
  }

  /** Compose the six graph nodes, bridged onto the deployment service. */
  private composeNodes(
    targetId: string,
    targetPath: string,
    targetType: DeploymentTargetType,
    executor: IAgentExecutor | null,
    log: (line: string) => void
  ): DevServerAgentGraphNodes {
    const { deploymentService, runPlanRepository, structuredCaller } = this.deps;
    const installer = this.deps.installer ?? new DependencyInstaller();
    const reportState = (state: DeploymentState.Analyzing | DeploymentState.Installing): void =>
      deploymentService.setTransientState(targetId, targetPath, targetType, state);

    return {
      analyze: createAnalyzeNode({
        runPlanRepository,
        detect: detectDevScript,
        structuredCaller,
        computeConfigHash,
        reportAnalyzing: () => reportState(DeploymentState.Analyzing),
        log,
      }),
      ensureInfra: createEnsureInfraNode({ executor, log }),
      installDeps: createInstallDepsNode({
        installer,
        runPlanRepository,
        computeInstallHash,
        pathExists: existsSync,
        reportInstalling: () => reportState(DeploymentState.Installing),
        log,
      }),
      startServer: createStartServerNode({ deploymentService, log }),
      verify: createVerifyNode({
        getStatus: (id) => deploymentService.getStatus(id),
        getLogs: (id) => deploymentService.getLogs(id),
        log,
      }),
      remediate: createRemediateNode({ executor, runPlanRepository, log }),
    };
  }
}
