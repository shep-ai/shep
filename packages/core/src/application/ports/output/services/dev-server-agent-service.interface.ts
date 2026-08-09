/**
 * Dev-Server Agent Service Interface (Output Port)
 *
 * Port for launching the agentic dev-server flow (spec 103): the LangGraph
 * pipeline that analyzes a repository, ensures infrastructure, installs
 * dependencies, starts the dev server, verifies readiness, and remediates
 * failures — replacing the old direct `IDeploymentService.start()` path in
 * the start-deployment use cases.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides the concrete DevServerAgentService
 */

import type { DeploymentState, DeploymentTargetType } from '../../../../domain/generated/output.js';

/** Result of accepting a dev-server run. */
export interface DevServerStartResult {
  /** The deployment state at acceptance time (normally Analyzing). */
  state: DeploymentState;
}

/**
 * Port interface for the agentic dev-server orchestrator.
 */
export interface IDevServerAgentService {
  /**
   * Start (or coalesce into) an agentic dev-server run for the target.
   *
   * Fire-and-track: resolves once the run is ACCEPTED — the transient
   * Analyzing state has been set on the deployment service and the graph
   * has been launched — NOT when the dev server is ready. Progress is
   * observable via `IDeploymentService.getStatus()` / `getLogs()` and the
   * 'log' event stream, matching the historical Booting contract.
   *
   * Single-flight per targetId: while a run is already in flight the call
   * does not launch a second graph — it resolves with the target's current
   * deployment state.
   *
   * @param targetId - Unique identifier for the deployment target
   * @param targetPath - Absolute filesystem path of the repository/worktree
   * @param targetType - Kind of entity being deployed
   * @returns The deployment state after acceptance (never rejects for graph
   *          failures — those surface via deployment logs and Stopped state)
   */
  startDevServer(
    targetId: string,
    targetPath: string,
    targetType: DeploymentTargetType
  ): Promise<DevServerStartResult>;
}
