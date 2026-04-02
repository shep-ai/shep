/**
 * Feature Agent Process Service Interface
 *
 * Output port for managing feature agent background processes.
 * Implementations handle forking worker processes, checking liveness,
 * and marking crashed processes.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides concrete implementation
 */

import type { ApprovalGates, AgentType, FeatureMode } from '../../../../domain/generated/output.js';

/**
 * Service interface for feature agent background process management.
 */
export interface IFeatureAgentProcessService {
  /**
   * Spawn a background worker process for a feature agent run.
   *
   * @param featureId - The feature ID to process
   * @param runId - The agent run ID for tracking
   * @param repoPath - Repository path for context
   * @param specDir - Spec directory path
   * @returns The PID of the spawned process
   */
  spawn(
    featureId: string,
    runId: string,
    repoPath: string,
    specDir: string,
    worktreePath?: string,
    options?: {
      approvalGates?: ApprovalGates;
      resume?: boolean;
      threadId?: string;
      resumeFromInterrupt?: boolean;
      push?: boolean;
      openPr?: boolean;
      forkAndPr?: boolean;
      commitSpecs?: boolean;
      ciWatchEnabled?: boolean;
      enableEvidence?: boolean;
      commitEvidence?: boolean;
      resumePayload?: string;
      agentType?: AgentType;
      mode?: FeatureMode;
      model?: string;
      resumeReason?: string;
    }
  ): number;

  /**
   * Check if a process is still alive.
   *
   * @param pid - The process ID to check
   * @returns True if the process is running
   */
  isAlive(pid: number): boolean;

  /**
   * Check if the process for an agent run is alive.
   * If the process is dead, mark the run as interrupted.
   *
   * @param runId - The agent run ID to check
   */
  checkAndMarkCrashed(runId: string): Promise<void>;
}
