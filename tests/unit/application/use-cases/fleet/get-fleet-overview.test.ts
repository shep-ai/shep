/**
 * GetFleetOverviewUseCase Unit Tests
 *
 * Verifies rollup count aggregation and circuit breaker tripping conditions.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetFleetOverviewUseCase } from '@/application/use-cases/fleet/get-fleet-overview.use-case.js';
import type { IFleetRepository } from '@/application/ports/output/repositories/fleet-repository.interface.js';
import type { FleetOverview } from '@/domain/generated/output.js';

describe('GetFleetOverviewUseCase', () => {
  let useCase: GetFleetOverviewUseCase;
  let mockFleetRepo: IFleetRepository;

  beforeEach(() => {
    mockFleetRepo = {
      getOverview: vi.fn(),
      listTriageItems: vi.fn(),
      getConsecutiveFailures: vi.fn(),
      getRollingFailureRate: vi.fn(),
    };

    useCase = new GetFleetOverviewUseCase(mockFleetRepo);
  });

  it('should return overview with normal circuit breaker state when failures are below threshold', async () => {
    const baseOverview: FleetOverview = {
      counts: {
        total: 50,
        cruising: 42,
        queued: 5,
        attentionNeeded: 3,
        failed: 0,
        waitingApproval: 2,
        blockedQuestions: 1,
      },
      circuitBreakerTripped: false,
      activeTriageCount: 3,
      consecutiveFailures: 0,
      timestamp: '2026-09-11T12:00:00Z',
    };

    vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(baseOverview);
    vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(1);
    vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
      totalCompleted: 10,
      failedCount: 1,
      failureRatePercent: 10,
    });

    const result = await useCase.execute();

    expect(result.counts.total).toBe(50);
    expect(result.counts.cruising).toBe(42);
    expect(result.circuitBreakerTripped).toBe(false);
  });

  it('should trip the circuit breaker when consecutive failures reach threshold (default: 4)', async () => {
    const baseOverview: FleetOverview = {
      counts: {
        total: 50,
        cruising: 35,
        queued: 10,
        attentionNeeded: 5,
        failed: 4,
        waitingApproval: 1,
        blockedQuestions: 0,
      },
      circuitBreakerTripped: false,
      activeTriageCount: 5,
      consecutiveFailures: 0,
      timestamp: '2026-09-11T12:00:00Z',
    };

    vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(baseOverview);
    vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(4);
    vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
      totalCompleted: 5,
      failedCount: 4,
      failureRatePercent: 80,
    });

    const result = await useCase.execute();

    expect(result.circuitBreakerTripped).toBe(true);
    expect(result.circuitBreakerReason).toContain('Consecutive failure threshold reached (4/4');
  });

  it('should trip the circuit breaker when rolling failure rate exceeds threshold (default: 25%)', async () => {
    const baseOverview: FleetOverview = {
      counts: {
        total: 20,
        cruising: 10,
        queued: 5,
        attentionNeeded: 5,
        failed: 2,
        waitingApproval: 0,
        blockedQuestions: 0,
      },
      circuitBreakerTripped: false,
      activeTriageCount: 5,
      consecutiveFailures: 0,
      timestamp: '2026-09-11T12:00:00Z',
    };

    vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(baseOverview);
    vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(2); // not consecutive 4
    vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
      totalCompleted: 6,
      failedCount: 3,
      failureRatePercent: 50, // 50% > 25%
    });

    const result = await useCase.execute();

    expect(result.circuitBreakerTripped).toBe(true);
    expect(result.circuitBreakerReason).toContain('Failure rate threshold exceeded (50% > 25%');
  });
});
