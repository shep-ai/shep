/**
 * SetFleetQueuePauseUseCase
 *
 * The single writer for `workflow.queuePaused` — the record that parks the fleet
 * admission queue. Two callers share it:
 *
 *   - the circuit breaker, which pauses when consecutive failures (or the
 *     rolling failure rate) cross the configured threshold, and
 *   - `shep fleet pause` / `shep fleet resume`, which are the user's manual
 *     lever and the ONLY way to clear a breaker pause.
 *
 * The breaker deliberately cannot resume. A fleet that tripped while the user
 * was asleep would otherwise restart into the same failing conditions the moment
 * the rolling window happened to look healthy again; the user clears it once
 * they have looked at what broke.
 *
 * Following Clean Architecture:
 * - Application layer use case
 * - Port dependency: ISettingsRepository
 */

import { injectable, inject } from 'tsyringe';
import type { FleetQueuePause } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { AdmitQueuedFeaturesUseCase } from '../features/capacity/admit-queued-features.use-case.js';

export interface SetFleetQueuePauseInput {
  /** True to park the queue, false to let it drain again. */
  paused: boolean;
  /** Why — shown by `fleet status` and the dashboard. Ignored when resuming. */
  reason?: string;
  /** Override for tests; defaults to now. */
  now?: Date;
}

@injectable()
export class SetFleetQueuePauseUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject(AdmitQueuedFeaturesUseCase)
    private readonly admitQueued: AdmitQueuedFeaturesUseCase
  ) {}

  /**
   * Park or release the admission queue.
   *
   * @returns The pause now in force, or null when the queue is draining.
   */
  async execute(input: SetFleetQueuePauseInput): Promise<FleetQueuePause | null> {
    const settings = await this.settingsRepository.load();
    if (!settings) {
      throw new Error('Settings not found. Please run initialization first.');
    }

    if (input.paused) {
      const existing = settings.workflow.queuePaused;
      if (existing) {
        // Already parked. Keep the ORIGINAL pausedAt and reason: the breaker is
        // re-evaluated on every status read, and re-stamping would make a queue
        // that has been parked for an hour read as "paused just now", forever.
        return existing;
      }

      const pause: FleetQueuePause = {
        pausedAt: input.now ?? new Date(),
        reason: input.reason ?? 'Admission queue paused',
      };

      await this.settingsRepository.update({
        ...settings,
        workflow: { ...settings.workflow, queuePaused: pause },
      });

      // Nothing is admitted here — pausing exists to stop admissions.
      return pause;
    }

    if (!settings.workflow.queuePaused) {
      // Not paused: nothing to clear, but the caller may still be asking for the
      // fleet to be running, so the drain below is worth attempting.
      await this.drain();
      return null;
    }

    // Rebuilt without `queuePaused` rather than set to undefined, so the mapper
    // writes SQL NULL instead of the string "undefined".
    const { queuePaused: _cleared, ...workflow } = settings.workflow;

    // Acknowledge the trip in the same write that releases the queue.
    //
    // Without this, resume cannot stick: the breaker reads a rolling window of
    // `agent_runs`, nothing there records that a human has looked at the
    // failures, so the next status read sees the same runs and trips again —
    // re-parking the queue with a fresh `pausedAt`. On the web that read happens
    // on every dashboard render and every SSE agent event, so the user's resume
    // would be undone within seconds, for the rest of the 15-minute window.
    //
    // Stamping it means the breaker judges only runs that finished AFTER this
    // moment: a trip becomes "failures since you last looked", which is what an
    // operator expects the breaker to mean.
    await this.settingsRepository.update({
      ...settings,
      workflow: { ...workflow, breakerAcknowledgedAt: input.now ?? new Date() },
    });

    await this.drain();

    return null;
  }

  /**
   * Release whatever the new ceiling now has room for.
   *
   * Isolated: a queued feature whose own dependency gate is still shut, or a
   * spawn that fails, must not make a successful resume look like it failed.
   */
  private async drain(): Promise<void> {
    try {
      await this.admitQueued.execute();
    } catch {
      // Intentionally ignored — the dashboard sweep retries.
    }
  }
}
