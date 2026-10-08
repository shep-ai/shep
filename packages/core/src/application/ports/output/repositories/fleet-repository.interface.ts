/**
 * Fleet Repository Interface
 *
 * Output port for Fleet-level aggregation, exception triage, and circuit breaker metrics.
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 */

import type {
  FleetOverview,
  FleetTriageItem,
  FleetTriagePriority,
} from '../../../../domain/generated/output.js';

export interface FleetTriageFilters {
  priority?: FleetTriagePriority;
  repositoryPath?: string;
  limit?: number;
}

/**
 * Optional lower bound on the run history a breaker metric inspects.
 *
 * `since` is how a breaker metric is told "the user already looked at everything
 * before this moment". It only ever NARROWS the window — a timestamp older than
 * the window's own start has no effect.
 */
export interface FleetMetricWindow {
  /** Ignore runs that finished before this moment. */
  since?: Date;
}

export interface IFleetRepository {
  /**
   * Get the aggregate status counts and circuit breaker health for all active/queued features.
   *
   * @param repositoryPath Optional repository path to filter the fleet scope
   */
  getOverview(repositoryPath?: string): Promise<FleetOverview>;

  /**
   * List actionable exceptions requiring human attention (P1 blockers, P2 failures, P3 warnings).
   *
   * @param filters Optional filtering by priority or repository
   */
  listTriageItems(filters?: FleetTriageFilters): Promise<FleetTriageItem[]>;

  /**
   * Count consecutive agent run failures in the rolling time window (e.g. last 15 minutes).
   *
   * @param repositoryPath Optional repository path to filter the run history
   * @param windowMinutes Rolling window duration in minutes (default: 15)
   * @param window Optional lower bound; a run that finished before `since` does not count
   */
  getConsecutiveFailures(
    repositoryPath?: string,
    windowMinutes?: number,
    window?: FleetMetricWindow
  ): Promise<number>;

  /**
   * Calculate the rolling failure percentage of runs finished in the window.
   *
   * @param repositoryPath Optional repository path to filter the run history
   * @param windowMinutes Rolling window duration in minutes (default: 15)
   * @param window Optional lower bound; a run that finished before `since` does not count
   */
  getRollingFailureRate(
    repositoryPath?: string,
    windowMinutes?: number,
    window?: FleetMetricWindow
  ): Promise<{
    totalCompleted: number;
    failedCount: number;
    failureRatePercent: number;
  }>;
}
