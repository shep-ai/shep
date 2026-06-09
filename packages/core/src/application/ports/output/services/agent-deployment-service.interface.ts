/**
 * Agent Deployment Service Interface
 *
 * Higher-level deployment service that uses the DevEnvironmentAgent
 * to analyze repos before starting deployments. Wraps the low-level
 * IDeploymentService with AI-driven analysis.
 *
 * Flow:
 * 1. Analyze repo via DevEnvironmentAgent (cached per-repo)
 * 2. If not deployable → return "not deployable" result
 * 3. If deployable → run setup commands → start dev server
 */

import type { DeploymentState } from '@/domain/generated/output.js';
import type { DevEnvironmentAnalysis } from './dev-environment-agent.interface.js';

/** Result of an agent-driven deployment attempt. */
export interface AgentDeployResult {
  /** Whether the deployment was started successfully. */
  success: boolean;

  /** Error message if the deployment failed. */
  error?: string;

  /** Current deployment state (Booting on success). */
  state?: DeploymentState;

  /** The analysis result from the dev environment agent. */
  analysis?: DevEnvironmentAnalysis;
}

/**
 * Port interface for agent-driven deployments.
 *
 * Uses DevEnvironmentAgent to analyze the repo, then starts the
 * deployment using the detected command. Handles repos that have
 * nothing to deploy by returning a descriptive result.
 */
export interface IAgentDeploymentService {
  /**
   * Analyze a repository and start its dev environment if possible.
   *
   * @param targetId - Unique identifier for the deployment (featureId or repositoryPath)
   * @param targetPath - Absolute filesystem path to the directory to deploy from
   * @param options - Optional: force re-analysis by skipping cache
   * @returns Result with success/error and the analysis
   */
  deploy(
    targetId: string,
    targetPath: string,
    options?: { skipCache?: boolean }
  ): Promise<AgentDeployResult>;
}
