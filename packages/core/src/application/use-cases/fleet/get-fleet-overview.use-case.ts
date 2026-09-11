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
} from '../../../domain/generated/output.js';
import type { IFleetRepository } from '../../ports/output/repositories/fleet-repository.interface.js';

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
    private readonly fleetRepo: IFleetRepository
  ) {}

  /**
   * Retrieves fleet overview and evaluates circuit breaker state.
   *
   * @param repositoryPath Optional repository path to scope the fleet
   */
  async execute(repositoryPath?: string): Promise<FleetOverview> {
    const overview = await this.fleetRepo.getOverview(repositoryPath);

    const config = DEFAULT_CIRCUIT_BREAKER_SETTINGS;
    if (!config.enabled) {
      return overview;
    }

    const consecutive = await this.fleetRepo.getConsecutiveFailures(CIRCUIT_BREAKER_WINDOW_MINUTES);
    overview.consecutiveFailures = consecutive;

    if (consecutive >= config.consecutiveFailureThreshold) {
      overview.circuitBreakerTripped = true;
      overview.circuitBreakerReason = `Consecutive failure threshold reached (${consecutive}/${config.consecutiveFailureThreshold} runs failed in the last ${CIRCUIT_BREAKER_WINDOW_MINUTES}m)`;
      return overview;
    }

    const rateData = await this.fleetRepo.getRollingFailureRate(CIRCUIT_BREAKER_WINDOW_MINUTES);
    if (
      rateData.totalCompleted >= CIRCUIT_BREAKER_MIN_SAMPLE_SIZE &&
      rateData.failureRatePercent >= config.failureRateThresholdPercent
    ) {
      overview.circuitBreakerTripped = true;
      overview.circuitBreakerReason = `Failure rate threshold exceeded (${rateData.failureRatePercent.toFixed(0)}% > ${config.failureRateThresholdPercent}% across ${rateData.totalCompleted} runs in the last ${CIRCUIT_BREAKER_WINDOW_MINUTES}m)`;
    }

    return overview;
  }
}
