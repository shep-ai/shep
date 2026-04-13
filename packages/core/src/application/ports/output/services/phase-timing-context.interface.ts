/**
 * Phase Timing Context Port
 *
 * Output port for recording instant lifecycle events (e.g., run:stopped,
 * run:rejected) on the agent-run phase timeline. Application-layer use
 * cases call this instead of importing the infrastructure phase-timing
 * context module directly.
 */

import type { IPhaseTimingRepository } from '../agents/phase-timing-repository.interface.js';

/**
 * Provider for recording lifecycle events on the phase timeline.
 */
export interface IPhaseTimingContext {
  /**
   * Record an instant lifecycle event (zero-duration phase timing record)
   * for the given agent run. Errors are swallowed — lifecycle event
   * recording is non-fatal.
   *
   * @param phase - Event name (e.g., 'run:stopped', 'run:rejected')
   * @param runId - Agent run id to attach the event to
   * @param repository - Phase timing repository to persist the event
   */
  recordLifecycleEvent(
    phase: string,
    runId: string,
    repository: IPhaseTimingRepository
  ): Promise<void>;
}
