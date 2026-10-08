/**
 * Get Fleet Overview Use Case
 *
 * Aggregates overall health status across the fleet (cruising, queued, attention,
 * failed) and evaluates whether the fleet circuit breaker should trip based on
 * consecutive failures and the rolling failure rate.
 *
 * Following Clean Architecture:
 * - Application layer use case
 * - Port dependency: IFleetRepository
 */

import { injectable, inject } from 'tsyringe';
import type {
  FleetOverview,
  FleetCircuitBreakerSettings,
  FleetQueuePause,
} from '../../../domain/generated/output.js';
import type { IFleetRepository } from '../../ports/output/repositories/fleet-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import {
  resolveBreakerAcknowledgedAt,
  resolveFleetQueuePause,
} from '../../../domain/shared/parallel-feature-limit.js';
import { SetFleetQueuePauseUseCase } from './set-fleet-queue-pause.use-case.js';

/** Rolling window the circuit breaker inspects, in minutes. */
export const CIRCUIT_BREAKER_WINDOW_MINUTES = 15;

/**
 * Minimum number of finished runs in the window before the rolling failure
 * rate is meaningful. Without this floor a single failure out of one run
 * reads as a 100% failure rate and trips the breaker immediately.
 */
export const CIRCUIT_BREAKER_MIN_SAMPLE_SIZE = 4;

/**
 * Circuit breaker policy.
 *
 * NOTE: these bounds are not yet user-configurable. Exposing them requires a
 * `workflow.circuitBreaker` field on the TypeSpec `Settings` model plus a
 * migration and a settings-mapper round-trip; that is tracked as follow-up
 * work in `specs/111-fleet-control-plane/tasks.yaml` rather than half-wired here.
 *
 * `autoPauseQueue` IS acted on: a trip parks the admission queue. Admission
 * control (`maxParallelFeatures`, `AdmitQueuedFeaturesUseCase`) landed in #847,
 * so the pause has something to stop.
 */
export const DEFAULT_CIRCUIT_BREAKER_SETTINGS: FleetCircuitBreakerSettings = {
  enabled: true,
  consecutiveFailureThreshold: 4,
  failureRateThresholdPercent: 25,
  autoPauseQueue: true,
};

@injectable()
export class GetFleetOverviewUseCase {
  constructor(
    @inject('IFleetRepository')
    private readonly fleetRepo: IFleetRepository,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject(SetFleetQueuePauseUseCase)
    private readonly queuePause: SetFleetQueuePauseUseCase
  ) {}

  /**
   * Retrieves fleet overview and evaluates circuit breaker state.
   *
   * When the breaker trips and `autoPauseQueue` is set, this also parks the
   * admission queue — the behaviour the spec's RFC promised, which was weakened
   * to a status signal only while admission control was still unmerged. The trip
   * is reported either way: a pause that cannot be written must not turn a
   * readable status into an error.
   *
   * @param repositoryPath Optional repository path to scope the fleet
   */
  async execute(repositoryPath?: string): Promise<FleetOverview> {
    const overview = await this.fleetRepo.getOverview(repositoryPath);

    // Read once: it answers both "is the queue parked" and "which failures has
    // the user already seen".
    const settings = await this.settingsRepository.load();

    // Reported on every path, including the disabled-breaker one: "the queue is
    // parked" is true whether the breaker put it there or the user ran
    // `shep fleet pause`, and the user needs to see it either way.
    overview.queuePaused = resolveFleetQueuePause(settings);

    const config = DEFAULT_CIRCUIT_BREAKER_SETTINGS;
    if (!config.enabled) {
      return overview;
    }

    // Only runs that finished after the user last acknowledged a trip can trip
    // the breaker again. Without this, `shep fleet resume` is undone by the very
    // next read while the same failures are still inside the window. Omitted
    // entirely when there is no acknowledgement, so the metric reads exactly as
    // it did before this existed.
    const acknowledgedAt = resolveBreakerAcknowledgedAt(settings);
    const window = acknowledgedAt ? { since: acknowledgedAt } : undefined;

    // Both breaker metrics are scoped exactly like the counts above: a scoped
    // view must not trip because of another repository's failures.
    const consecutive = await this.fleetRepo.getConsecutiveFailures(
      repositoryPath,
      CIRCUIT_BREAKER_WINDOW_MINUTES,
      window
    );
    overview.consecutiveFailures = consecutive;

    if (consecutive >= config.consecutiveFailureThreshold) {
      overview.circuitBreakerTripped = true;
      overview.circuitBreakerReason = `Consecutive failure threshold reached (${consecutive}/${config.consecutiveFailureThreshold} runs failed in the last ${CIRCUIT_BREAKER_WINDOW_MINUTES}m)`;
      overview.queuePaused = await this.pauseQueueIfConfigured(
        config,
        overview.circuitBreakerReason,
        repositoryPath
      );
      return overview;
    }

    const rateData = await this.fleetRepo.getRollingFailureRate(
      repositoryPath,
      CIRCUIT_BREAKER_WINDOW_MINUTES,
      window
    );
    if (
      rateData.totalCompleted >= CIRCUIT_BREAKER_MIN_SAMPLE_SIZE &&
      rateData.failureRatePercent >= config.failureRateThresholdPercent
    ) {
      overview.circuitBreakerTripped = true;
      overview.circuitBreakerReason = `Failure rate threshold exceeded (${rateData.failureRatePercent.toFixed(0)}% > ${config.failureRateThresholdPercent}% across ${rateData.totalCompleted} runs in the last ${CIRCUIT_BREAKER_WINDOW_MINUTES}m)`;
      overview.queuePaused = await this.pauseQueueIfConfigured(
        config,
        overview.circuitBreakerReason,
        repositoryPath
      );
    }

    return overview;
  }

  /**
   * Park the admission queue, when the breaker is configured to, and report the
   * pause that is now in force.
   *
   * Returns the pause so the read that TRIPS the breaker also reports it. The
   * settings read at the top of `execute` happened before this write, so without
   * returning it the tripping read would say TRIPPED and show no PAUSED line —
   * the user would only learn the queue was parked on some later read.
   *
   * Idempotent at the use case, so the repeated reads a dashboard performs do
   * not rewrite settings or move the original `pausedAt`.
   */
  private async pauseQueueIfConfigured(
    config: FleetCircuitBreakerSettings,
    reason: string,
    repositoryPath?: string
  ): Promise<FleetQueuePause | undefined> {
    if (!config.autoPauseQueue) {
      return undefined;
    }

    // A SCOPED read must not park the fleet. `shep fleet status --repo <path>`
    // judges one repository, but the pause it would write is global — so one
    // repo's failures would stop work in every other repo. Report the trip and
    // leave the lever to the fleet-wide view (and to `shep fleet pause`).
    if (repositoryPath) {
      return undefined;
    }

    try {
      return (await this.queuePause.execute({ paused: true, reason })) ?? undefined;
    } catch {
      // The trip is still reported. Whatever broke the settings write is the
      // caller's next problem, and the next status read tries again.
      return undefined;
    }
  }
}
