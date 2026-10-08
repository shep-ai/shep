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

/** The overview every test starts from; individual cases override counts. */
function overview(overrides: Partial<FleetOverview> = {}): FleetOverview {
  return {
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
    ...overrides,
  };
}

describe('GetFleetOverviewUseCase', () => {
  let useCase: GetFleetOverviewUseCase;
  let mockFleetRepo: IFleetRepository;
  let queuePause: { execute: ReturnType<typeof vi.fn> };
  let settingsRepo: { load: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockFleetRepo = {
      getOverview: vi.fn(),
      listTriageItems: vi.fn(),
      getConsecutiveFailures: vi.fn(),
      getRollingFailureRate: vi.fn(),
    };
    queuePause = { execute: vi.fn().mockResolvedValue(undefined) };
    settingsRepo = { load: vi.fn().mockResolvedValue({ workflow: {} }) };
    useCase = new GetFleetOverviewUseCase(
      mockFleetRepo,
      settingsRepo as never,
      queuePause as never
    );
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
    vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
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
    vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
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

  // Regression for the review on #860: the counts were scoped but the breaker
  // metrics were called without the scope, so a scoped view could trip on
  // another repository's failures. This is the assertion that was missing.
  it('should pass the repository scope through to every scoped read', async () => {
    vi.mocked(mockFleetRepo.getOverview).mockResolvedValue({
      counts: {
        total: 10,
        cruising: 10,
        queued: 0,
        attentionNeeded: 0,
        failed: 0,
        waitingApproval: 0,
        blockedQuestions: 0,
      },
      circuitBreakerTripped: false,
      activeTriageCount: 0,
      consecutiveFailures: 0,
      timestamp: '2026-09-11T12:00:00Z',
    });
    vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(0);
    vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
      totalCompleted: 0,
      failedCount: 0,
      failureRatePercent: 0,
    });

    await useCase.execute('/repo/alpha');

    expect(mockFleetRepo.getOverview).toHaveBeenCalledWith('/repo/alpha');
    expect(mockFleetRepo.getConsecutiveFailures).toHaveBeenCalledWith('/repo/alpha', 15, undefined);
    expect(mockFleetRepo.getRollingFailureRate).toHaveBeenCalledWith('/repo/alpha', 15, undefined);
  });

  it('should leave the breaker metrics unscoped when no repository is supplied', async () => {
    vi.mocked(mockFleetRepo.getOverview).mockResolvedValue({
      counts: {
        total: 10,
        cruising: 10,
        queued: 0,
        attentionNeeded: 0,
        failed: 0,
        waitingApproval: 0,
        blockedQuestions: 0,
      },
      circuitBreakerTripped: false,
      activeTriageCount: 0,
      consecutiveFailures: 0,
      timestamp: '2026-09-11T12:00:00Z',
    });
    vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(0);
    vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
      totalCompleted: 0,
      failedCount: 0,
      failureRatePercent: 0,
    });

    await useCase.execute();

    // The third argument is the acknowledgement bound; undefined when the user
    // has never acknowledged a trip, which is the pre-existing behaviour.
    expect(mockFleetRepo.getConsecutiveFailures).toHaveBeenCalledWith(undefined, 15, undefined);
    expect(mockFleetRepo.getRollingFailureRate).toHaveBeenCalledWith(undefined, 15, undefined);
  });

  /**
   * The RFC promise this closes: "auto-pauses the feature admission queue when
   * consecutive failures exceed threshold". Before this, the trip was reported
   * as a badge and nothing stopped.
   */
  describe('auto-pausing the admission queue on trip', () => {
    const tripByConsecutiveFailures = () => {
      vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
      vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(4);
      vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
        totalCompleted: 5,
        failedCount: 4,
        failureRatePercent: 80,
      });
    };

    it('pauses the queue when the breaker trips', async () => {
      tripByConsecutiveFailures();

      await useCase.execute();

      expect(queuePause.execute).toHaveBeenCalledWith({
        paused: true,
        reason: expect.stringContaining('Consecutive failure threshold reached (4/4'),
      });
    });

    it('pauses the queue when the breaker trips on the rolling failure rate', async () => {
      vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
      vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(2);
      vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
        totalCompleted: 6,
        failedCount: 3,
        failureRatePercent: 50,
      });

      await useCase.execute();

      expect(queuePause.execute).toHaveBeenCalledWith({
        paused: true,
        reason: expect.stringContaining('Failure rate threshold exceeded'),
      });
    });

    it('leaves the queue alone while the breaker is normal', async () => {
      vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
      vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(1);
      vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
        totalCompleted: 10,
        failedCount: 1,
        failureRatePercent: 10,
      });

      await useCase.execute();

      expect(queuePause.execute).not.toHaveBeenCalled();
    });

    it('does not treat a sub-threshold failure rate as a trip, however bad the ratio', async () => {
      // One failure out of one run is a 100% rate and a meaningless sample; the
      // minimum sample size exists precisely so a single failure cannot park the
      // whole fleet.
      vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
      vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(1);
      vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
        totalCompleted: 1,
        failedCount: 1,
        failureRatePercent: 100,
      });

      const result = await useCase.execute();

      expect(result.circuitBreakerTripped).toBe(false);
      expect(queuePause.execute).not.toHaveBeenCalled();
    });

    it('reports the trip even when pausing the queue fails', async () => {
      // A paused-queue write that cannot land must not turn a successful status
      // read into an error: the user still needs to see that the breaker is
      // tripped. The dashboard sweep re-reads and tries the pause again.
      tripByConsecutiveFailures();
      queuePause.execute.mockRejectedValue(new Error('settings write failed'));

      const result = await useCase.execute();

      expect(result.circuitBreakerTripped).toBe(true);
      expect(result.circuitBreakerReason).toContain('Consecutive failure threshold reached');
    });
  });

  describe('reporting the pause', () => {
    const quietBreaker = () => {
      vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
      vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(0);
      vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
        totalCompleted: 0,
        failedCount: 0,
        failureRatePercent: 0,
      });
    };

    it('surfaces a recorded pause on the overview', async () => {
      quietBreaker();
      settingsRepo.load.mockResolvedValue({
        workflow: {
          queuePaused: { pausedAt: '2026-03-01T12:00:00Z', reason: 'Circuit breaker tripped' },
        },
      });

      const result = await useCase.execute();

      expect(result.queuePaused).toEqual({
        pausedAt: '2026-03-01T12:00:00Z',
        reason: 'Circuit breaker tripped',
      });
    });

    it('leaves the pause absent while the queue is draining', async () => {
      quietBreaker();

      const result = await useCase.execute();

      expect(result.queuePaused).toBeUndefined();
    });
  });

  /**
   * The maintainer's finding: `overview.queuePaused` was assigned BEFORE the
   * pause was written, so the very read that parked the queue reported TRIPPED
   * with no PAUSED line. The user only discovered the queue was parked on some
   * later read — and `docs/cli/commands.md` documented a state the tripping read
   * could never produce.
   */
  describe('the tripping read reports the pause it just wrote', () => {
    it('includes the pause on the read that trips the breaker', async () => {
      vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
      vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(4);
      vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
        totalCompleted: 5,
        failedCount: 4,
        failureRatePercent: 80,
      });
      const pause = {
        pausedAt: '2026-03-01T12:00:00Z',
        reason: 'Consecutive failure threshold reached',
      };
      queuePause.execute.mockResolvedValue(pause);

      const result = await useCase.execute();

      expect(result.circuitBreakerTripped).toBe(true);
      expect(result.queuePaused).toEqual(pause);
    });

    it('reports no pause when the pause write failed', async () => {
      vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
      vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(4);
      vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
        totalCompleted: 5,
        failedCount: 4,
        failureRatePercent: 80,
      });
      queuePause.execute.mockRejectedValue(new Error('settings write failed'));

      const result = await useCase.execute();

      // Still reports the trip, and honestly reports that nothing was parked.
      expect(result.circuitBreakerTripped).toBe(true);
      expect(result.queuePaused).toBeUndefined();
    });
  });

  /**
   * The maintainer's finding: the breaker read the whole 15-minute window, so
   * nothing recorded that the user had already looked. Resume was undone by the
   * next read — and on the web that read fires on every dashboard render and
   * every SSE agent event.
   */
  describe('only failures since the last acknowledgement can re-trip', () => {
    const tripping = () => {
      vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
      // Trips on the RATE branch, so the window is asserted on both metrics:
      // the consecutive counter returns early and would leave the second metric
      // uncalled.
      vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(2);
      vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
        totalCompleted: 5,
        failedCount: 4,
        failureRatePercent: 80,
      });
    };

    it('narrows both metrics to runs that finished after the acknowledgement', async () => {
      tripping();
      const acknowledged = new Date('2026-03-01T12:00:00Z');
      settingsRepo.load.mockResolvedValue({
        workflow: { breakerAcknowledgedAt: acknowledged.toISOString() },
      });

      await useCase.execute();

      expect(mockFleetRepo.getConsecutiveFailures).toHaveBeenCalledWith(undefined, 15, {
        since: acknowledged,
      });
      expect(mockFleetRepo.getRollingFailureRate).toHaveBeenCalledWith(undefined, 15, {
        since: acknowledged,
      });
    });

    it('omits the bound entirely when the user has never acknowledged a trip', async () => {
      // No acknowledgement must read EXACTLY as it did before this existed, so
      // an existing install keeps its current behaviour.
      tripping();

      await useCase.execute();

      expect(mockFleetRepo.getConsecutiveFailures).toHaveBeenCalledWith(undefined, 15, undefined);
      expect(mockFleetRepo.getRollingFailureRate).toHaveBeenCalledWith(undefined, 15, undefined);
    });

    it('treats an unparseable acknowledgement as absent rather than going blind', async () => {
      tripping();
      settingsRepo.load.mockResolvedValue({ workflow: { breakerAcknowledgedAt: 'not-a-date' } });

      await useCase.execute();

      expect(mockFleetRepo.getConsecutiveFailures).toHaveBeenCalledWith(undefined, 15, undefined);
    });
  });

  /**
   * The maintainer's finding: `shep fleet status --repo <path>` judged one
   * repository but wrote a GLOBAL pause, so one repo's failures parked every
   * repo.
   */
  describe('a scoped read reports the trip without parking the fleet', () => {
    it('does not write a pause when a repository scope is supplied', async () => {
      vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
      vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(4);
      vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
        totalCompleted: 5,
        failedCount: 4,
        failureRatePercent: 80,
      });

      const result = await useCase.execute('/repo/alpha');

      expect(result.circuitBreakerTripped).toBe(true);
      expect(queuePause.execute).not.toHaveBeenCalled();
      expect(result.queuePaused).toBeUndefined();
    });

    it('still parks the fleet on the unscoped read', async () => {
      vi.mocked(mockFleetRepo.getOverview).mockResolvedValue(overview());
      vi.mocked(mockFleetRepo.getConsecutiveFailures).mockResolvedValue(4);
      vi.mocked(mockFleetRepo.getRollingFailureRate).mockResolvedValue({
        totalCompleted: 5,
        failedCount: 4,
        failureRatePercent: 80,
      });

      await useCase.execute();

      expect(queuePause.execute).toHaveBeenCalledOnce();
    });
  });
});
