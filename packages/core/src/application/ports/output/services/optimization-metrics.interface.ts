/**
 * Optimization Metrics Service Interface
 *
 * Output port for persisting token optimization metrics alongside
 * existing PhaseTiming records. Records per-phase optimization data
 * (token estimates, savings, per-capability stats) for observability
 * and optimization tuning.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides persistence via PhaseTiming repository
 */

import type { OptimizationMetrics } from './prompt-optimizer.interface.js';

/**
 * Service interface for recording optimization metrics.
 *
 * Persists optimization metrics as additional fields on PhaseTiming
 * records. Uses the existing phase timing infrastructure so metrics
 * are queryable alongside timing and cost data.
 */
export interface IOptimizationMetricsService {
  /**
   * Record optimization metrics for a phase timing entry.
   *
   * Updates the PhaseTiming record with optimization-specific fields:
   * original/optimized token estimates, savings percent, capabilities
   * applied, and per-capability stats.
   *
   * @param phaseTimingId - ID of the PhaseTiming record to update
   * @param metrics - Optimization metrics to persist
   */
  record(phaseTimingId: string, metrics: OptimizationMetrics): Promise<void>;
}
