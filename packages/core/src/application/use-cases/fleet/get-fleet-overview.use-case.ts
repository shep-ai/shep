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
  Settings,
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
 * NOTE: the thresholds are not yet user-configurable. Exposing them requires a
 * `workflow.circuitBreaker` field on the TypeSpec `Settings` model plus a
 * migration and a settings-mapper round-trip; that is tracked as follow-up
 * work in `specs/111-fleet-control-plane/tasks.yaml` rather than half-wired here.
 *
 * `autoPauseQueue` ships **on**, and is the one field here a user can choose
 * (`workflow.circuitBreakerAutoPauseQueue`). A trip is reported either way; with
 * this on, the trip also parks the admission queue, and `shep fleet resume` (or
 * Resume on the fleet status bar) is how a person releases it. It stayed off
 * only until the dashboard could both show a pause and release it — the
 * dashboard's own reads are the most common thing that trips the breaker, so an
 * earlier default would have stranded a web user with no way out (`LESSONS.md`,
 * "No CLI-Only Flows in the Web UI"). That surface shipped in #937.
 *
 * An install that never chose (`NULL`) follows this default, so an upgrade
 * starts parking on a trip. An explicit `false` keeps opting out.
 */
export const DEFAULT_CIRCUIT_BREAKER_SETTINGS: FleetCircuitBreakerSettings = {
  enabled: true,
  consecutiveFailureThreshold: 4,
  failureRateThresholdPercent: 25,
  autoPauseQueue: true,
};

/**
 * The breaker policy for this install: the built-in bounds above, with the one
 * field a user can currently choose layered over them.
 *
 * An install that has never chosen (`undefined`, NULL in the column) keeps the
 * default rather than being read as an explicit `false`. That distinction still
 * matters after the default flip: "never asked" follows the product default when
 * it changes, while "asked for no" stays off across upgrades.
 */
export function resolveCircuitBreakerSettings(
  settings: Settings | null
): FleetCircuitBreakerSettings {
  const chosen = settings?.workflow?.circuitBreakerAutoPauseQueue;
  return chosen === undefined
    ? DEFAULT_CIRCUIT_BREAKER_SETTINGS
    : { ...DEFAULT_CIRCUIT_BREAKER_SETTINGS, autoPauseQueue: chosen };
}

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
   * When the breaker trips and `autoPauseQueue` is on — the default — this also
   * parks the admission queue, the behaviour the spec's RFC promised. An install
   * that explicitly opted out gets the trip reported and the pause left to
   * `shep fleet pause`. Either way the trip is reported: a pause that cannot be
   * written must not turn a readable status into an error.
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

    const config = resolveCircuitBreakerSettings(settings);
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
