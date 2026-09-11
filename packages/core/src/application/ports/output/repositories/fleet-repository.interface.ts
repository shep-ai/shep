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
   * @param windowMinutes Rolling window duration in minutes (default: 15)
   */
  getConsecutiveFailures(windowMinutes?: number): Promise<number>;

  /**
   * Calculate the rolling failure percentage of runs finished in the window.
   *
   * @param windowMinutes Rolling window duration in minutes (default: 15)
   */
  getRollingFailureRate(windowMinutes?: number): Promise<{
    totalCompleted: number;
    failedCount: number;
    failureRatePercent: number;
  }>;
}
