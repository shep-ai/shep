/**
 * Phase Timing Repository Interface
 *
 * Output port for PhaseTiming persistence operations.
 * Records timing data for each agent graph node execution.
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type { PhaseTiming } from '../../../../domain/generated/output.js';

/**
 * Repository interface for PhaseTiming entity persistence.
 */
export interface IPhaseTimingRepository {
  /**
   * Save a new phase timing record.
   *
   * @param phaseTiming - The phase timing to persist
   */
  save(phaseTiming: PhaseTiming): Promise<void>;

  /**
   * Update a phase timing record on completion with timing and execution metadata.
   *
   * @param id - The phase timing ID
   * @param updates - Fields to update (timing + optional token usage, exit code, error)
   */
  update(
    id: string,
    updates: Partial<
      Pick<
        PhaseTiming,
        | 'completedAt'
        | 'durationMs'
        | 'inputTokens'
        | 'outputTokens'
        | 'cacheCreationInputTokens'
        | 'cacheReadInputTokens'
        | 'costUsd'
        | 'numTurns'
        | 'durationApiMs'
        | 'exitCode'
        | 'errorMessage'
        | 'prompt'
        | 'originalTokenEstimate'
        | 'optimizedTokenEstimate'
        | 'savingsPercent'
        | 'capabilitiesApplied'
        | 'outputFilterLinesRemoved'
        | 'deltaContextFilesSkipped'
        | 'compressionRatio'
        | 'aliasesCreated'
      >
    >
  ): Promise<void>;

  /**
   * Update approval wait timing fields on a phase timing record.
   *
   * @param id - The phase timing ID
   * @param updates - Approval wait fields to update
   */
  updateApprovalWait(
    id: string,
    updates: Partial<Pick<PhaseTiming, 'waitingApprovalAt' | 'approvalWaitMs'>>
  ): Promise<void>;

  /**
   * Find a single phase timing record by its ID.
   *
   * @param id - The phase timing ID
   * @returns The phase timing record, or null if not found
   */
  findById(id: string): Promise<PhaseTiming | null>;

  /**
   * Find all phase timings for an agent run.
   *
   * @param agentRunId - The agent run ID
   * @returns Array of phase timings ordered by creation
   */
  findByRunId(agentRunId: string): Promise<PhaseTiming[]>;

  /**
   * Find all phase timings for a feature (via agent_runs join).
   *
   * @param featureId - The feature ID
   * @returns Array of phase timings ordered by creation
   */
  findByFeatureId(featureId: string): Promise<PhaseTiming[]>;
}
