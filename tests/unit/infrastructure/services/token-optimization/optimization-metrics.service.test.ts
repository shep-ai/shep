/**
 * OptimizationMetricsService Unit Tests
 *
 * Tests for the optimization metrics persistence service that records
 * token optimization stats alongside existing PhaseTiming records and
 * provides retrieval by phase timing ID.
 *
 * TDD Phase: RED
 *
 * Tests cover:
 * - record() persists all metric fields via the PhaseTiming repository
 * - getByPhaseTimingId() returns stored metrics for a known ID
 * - getByPhaseTimingId() returns null for an unknown ID
 * - record() failures are swallowed and never throw
 * - getByPhaseTimingId() returns null when no metrics columns are populated
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OptimizationMetricsService } from '@/infrastructure/services/token-optimization/optimization-metrics.service.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { OptimizationMetrics } from '@/application/ports/output/services/prompt-optimizer.interface.js';
import type { PhaseTiming } from '@/domain/generated/output.js';

/** Build a fully populated OptimizationMetrics fixture. */
function makeMetrics(overrides: Partial<OptimizationMetrics> = {}): OptimizationMetrics {
  return {
    originalTokenEstimate: 1000,
    optimizedTokenEstimate: 600,
    savingsPercent: 40,
    capabilitiesApplied: ['outputFiltering', 'semanticCompression'],
    outputFilterLinesRemoved: 12,
    deltaContextFilesSkipped: 2,
    compressionRatio: 0.6,
    aliasesCreated: 3,
    ...overrides,
  };
}

/** Build a baseline PhaseTiming row with optimization metrics populated. */
function makePhaseTimingWithMetrics(id: string, overrides: Partial<PhaseTiming> = {}): PhaseTiming {
  const now = new Date();
  return {
    id,
    agentRunId: 'run-1',
    phase: 'plan',
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    originalTokenEstimate: BigInt(1000),
    optimizedTokenEstimate: BigInt(600),
    savingsPercent: 40,
    capabilitiesApplied: JSON.stringify(['outputFiltering', 'semanticCompression']),
    outputFilterLinesRemoved: 12,
    deltaContextFilesSkipped: 2,
    compressionRatio: 0.6,
    aliasesCreated: 3,
    ...overrides,
  };
}

/** Build a PhaseTiming row with no optimization columns populated. */
function makePhaseTimingWithoutMetrics(id: string): PhaseTiming {
  const now = new Date();
  return {
    id,
    agentRunId: 'run-1',
    phase: 'plan',
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Create a mocked PhaseTiming repository. */
function makeRepoMock(overrides: Partial<IPhaseTimingRepository> = {}): IPhaseTimingRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    updateApprovalWait: vi.fn().mockResolvedValue(undefined),
    findByRunId: vi.fn().mockResolvedValue([]),
    findByFeatureId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as IPhaseTimingRepository;
}

describe('OptimizationMetricsService', () => {
  let repo: IPhaseTimingRepository;
  let service: OptimizationMetricsService;

  beforeEach(() => {
    repo = makeRepoMock();
    service = new OptimizationMetricsService(repo);
  });

  // --- record() ---

  describe('record', () => {
    it('persists all metric fields via the phase timing repository', async () => {
      const metrics = makeMetrics();

      await service.record('phase-timing-1', metrics);

      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledWith(
        'phase-timing-1',
        expect.objectContaining({
          originalTokenEstimate: BigInt(1000),
          optimizedTokenEstimate: BigInt(600),
          savingsPercent: 40,
          outputFilterLinesRemoved: 12,
          deltaContextFilesSkipped: 2,
          compressionRatio: 0.6,
          aliasesCreated: 3,
        })
      );
    });

    it('serializes capabilitiesApplied as a JSON string', async () => {
      const metrics = makeMetrics({
        capabilitiesApplied: ['outputFiltering', 'aliasCompression'],
      });

      await service.record('phase-timing-2', metrics);

      const updateArgs = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(updateArgs.capabilitiesApplied).toBe(
        JSON.stringify(['outputFiltering', 'aliasCompression'])
      );
    });

    it('passes the phase timing ID through to the repository', async () => {
      await service.record('specific-id', makeMetrics());

      expect(repo.update).toHaveBeenCalledWith('specific-id', expect.any(Object));
    });

    it('does not throw when the repository update fails', async () => {
      repo = makeRepoMock({
        update: vi.fn().mockRejectedValue(new Error('database is locked')),
      });
      service = new OptimizationMetricsService(repo);

      await expect(service.record('phase-1', makeMetrics())).resolves.toBeUndefined();
    });

    it('handles zero metric values without throwing', async () => {
      const zeroMetrics: OptimizationMetrics = {
        originalTokenEstimate: 0,
        optimizedTokenEstimate: 0,
        savingsPercent: 0,
        capabilitiesApplied: [],
        outputFilterLinesRemoved: 0,
        deltaContextFilesSkipped: 0,
        compressionRatio: 1.0,
        aliasesCreated: 0,
      };

      await service.record('phase-zero', zeroMetrics);

      expect(repo.update).toHaveBeenCalledTimes(1);
      const updateArgs = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(updateArgs.originalTokenEstimate).toBe(BigInt(0));
      expect(updateArgs.optimizedTokenEstimate).toBe(BigInt(0));
    });
  });

  // --- getByPhaseTimingId() ---

  describe('getByPhaseTimingId', () => {
    it('returns metrics from the stored phase timing record', async () => {
      const stored = makePhaseTimingWithMetrics('phase-timing-1');
      repo = makeRepoMock({
        findById: vi.fn().mockResolvedValue(stored),
      });
      service = new OptimizationMetricsService(repo);

      const result = await service.getByPhaseTimingId('phase-timing-1');

      expect(result).not.toBeNull();
      expect(result?.originalTokenEstimate).toBe(1000);
      expect(result?.optimizedTokenEstimate).toBe(600);
      expect(result?.savingsPercent).toBe(40);
      expect(result?.capabilitiesApplied).toEqual(['outputFiltering', 'semanticCompression']);
      expect(result?.outputFilterLinesRemoved).toBe(12);
      expect(result?.deltaContextFilesSkipped).toBe(2);
      expect(result?.compressionRatio).toBe(0.6);
      expect(result?.aliasesCreated).toBe(3);
    });

    it('queries the repository with the supplied phase timing ID', async () => {
      const findById = vi.fn().mockResolvedValue(null);
      repo = makeRepoMock({ findById });
      service = new OptimizationMetricsService(repo);

      await service.getByPhaseTimingId('specific-phase-id');

      expect(findById).toHaveBeenCalledWith('specific-phase-id');
    });

    it('returns null when no phase timing exists for the ID', async () => {
      repo = makeRepoMock({
        findById: vi.fn().mockResolvedValue(null),
      });
      service = new OptimizationMetricsService(repo);

      const result = await service.getByPhaseTimingId('unknown-id');

      expect(result).toBeNull();
    });

    it('returns null when phase timing exists but has no optimization metrics', async () => {
      const stored = makePhaseTimingWithoutMetrics('phase-timing-empty');
      repo = makeRepoMock({
        findById: vi.fn().mockResolvedValue(stored),
      });
      service = new OptimizationMetricsService(repo);

      const result = await service.getByPhaseTimingId('phase-timing-empty');

      expect(result).toBeNull();
    });

    it('returns null when the repository throws', async () => {
      repo = makeRepoMock({
        findById: vi.fn().mockRejectedValue(new Error('db read failed')),
      });
      service = new OptimizationMetricsService(repo);

      const result = await service.getByPhaseTimingId('any-id');

      expect(result).toBeNull();
    });

    it('handles malformed capabilitiesApplied JSON gracefully', async () => {
      const stored = makePhaseTimingWithMetrics('phase-malformed', {
        capabilitiesApplied: 'not valid json',
      });
      repo = makeRepoMock({
        findById: vi.fn().mockResolvedValue(stored),
      });
      service = new OptimizationMetricsService(repo);

      const result = await service.getByPhaseTimingId('phase-malformed');

      expect(result).not.toBeNull();
      expect(result?.capabilitiesApplied).toEqual([]);
    });
  });
});
