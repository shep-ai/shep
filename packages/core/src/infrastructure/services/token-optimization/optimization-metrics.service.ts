/**
 * Optimization Metrics Service
 *
 * Persists token optimization metrics on existing PhaseTiming records.
 * Updates the per-phase timing entry with optimization statistics so the
 * data is queryable alongside timing and cost data via the existing
 * phase timing infrastructure.
 *
 * Failure-tolerant: any persistence error is swallowed (after best-effort
 * logging) so optimization metric recording can never break a phase run.
 */

import { injectable, inject } from 'tsyringe';

import type { IOptimizationMetricsService } from '@/application/ports/output/services/optimization-metrics.interface.js';
import type { OptimizationMetrics } from '@/application/ports/output/services/prompt-optimizer.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { PhaseTiming } from '@/domain/generated/output.js';

/**
 * Parse the JSON-serialized capabilitiesApplied column. Returns an
 * empty array on malformed JSON so a corrupted row never throws on read.
 */
function parseCapabilitiesApplied(serialized: string | undefined): string[] {
  if (serialized === undefined || serialized === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Build an OptimizationMetrics object from a PhaseTiming row.
 *
 * Returns null when the row has no optimization columns populated
 * (record was created but optimizer never ran for it).
 */
function metricsFromPhaseTiming(timing: PhaseTiming): OptimizationMetrics | null {
  // If no optimization fields are present at all, treat as "no metrics".
  if (
    timing.originalTokenEstimate === undefined &&
    timing.optimizedTokenEstimate === undefined &&
    timing.savingsPercent === undefined &&
    timing.capabilitiesApplied === undefined
  ) {
    return null;
  }

  return {
    originalTokenEstimate:
      timing.originalTokenEstimate !== undefined ? Number(timing.originalTokenEstimate) : 0,
    optimizedTokenEstimate:
      timing.optimizedTokenEstimate !== undefined ? Number(timing.optimizedTokenEstimate) : 0,
    savingsPercent: timing.savingsPercent ?? 0,
    capabilitiesApplied: parseCapabilitiesApplied(timing.capabilitiesApplied),
    outputFilterLinesRemoved: timing.outputFilterLinesRemoved ?? 0,
    deltaContextFilesSkipped: timing.deltaContextFilesSkipped ?? 0,
    compressionRatio: timing.compressionRatio ?? 1.0,
    aliasesCreated: timing.aliasesCreated ?? 0,
  };
}

@injectable()
export class OptimizationMetricsService implements IOptimizationMetricsService {
  constructor(
    @inject('IPhaseTimingRepository')
    private readonly phaseTimingRepository: IPhaseTimingRepository
  ) {}

  /**
   * Persist optimization metrics on the named PhaseTiming row.
   *
   * Token estimates are stored as bigint (PhaseTiming column type),
   * capabilitiesApplied is serialized as a JSON string for the
   * existing string column.
   */
  async record(phaseTimingId: string, metrics: OptimizationMetrics): Promise<void> {
    try {
      await this.phaseTimingRepository.update(phaseTimingId, {
        originalTokenEstimate: BigInt(metrics.originalTokenEstimate),
        optimizedTokenEstimate: BigInt(metrics.optimizedTokenEstimate),
        savingsPercent: metrics.savingsPercent,
        capabilitiesApplied: JSON.stringify(metrics.capabilitiesApplied),
        outputFilterLinesRemoved: metrics.outputFilterLinesRemoved,
        deltaContextFilesSkipped: metrics.deltaContextFilesSkipped,
        compressionRatio: metrics.compressionRatio,
        aliasesCreated: metrics.aliasesCreated,
      });
    } catch {
      // Persistence failure must never break optimization
    }
  }

  /**
   * Retrieve previously recorded optimization metrics for a phase timing.
   *
   * Returns null when:
   *   - the phase timing record does not exist
   *   - the phase timing exists but has no optimization columns populated
   *   - the underlying repository read fails
   */
  async getByPhaseTimingId(phaseTimingId: string): Promise<OptimizationMetrics | null> {
    try {
      const timing = await this.phaseTimingRepository.findById(phaseTimingId);
      if (!timing) {
        return null;
      }
      return metricsFromPhaseTiming(timing);
    } catch {
      return null;
    }
  }
}
