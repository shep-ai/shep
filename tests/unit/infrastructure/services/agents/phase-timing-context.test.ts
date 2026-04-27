/**
 * Phase Timing Context Unit Tests
 *
 * Tests for the module-level singleton that provides phase timing
 * recording to executeNode() without changing its public API.
 *
 * TDD Phase: RED
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setPhaseTimingContext,
  clearPhaseTimingContext,
  recordPhaseStart,
  recordPhaseEnd,
  recordApprovalWaitStart,
  getLastTimingId,
} from '@/infrastructure/services/agents/feature-agent/phase-timing-context.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';

function createMockTimingRepo(): IPhaseTimingRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    updateApprovalWait: vi.fn().mockResolvedValue(undefined),
    findByRunId: vi.fn().mockResolvedValue([]),
    findByRunIds: vi.fn().mockResolvedValue([]),
    findByFeatureId: vi.fn().mockResolvedValue([]),
  };
}

describe('PhaseTimingContext', () => {
  beforeEach(() => {
    clearPhaseTimingContext();
  });

  describe('setPhaseTimingContext / clearPhaseTimingContext', () => {
    it('should allow setting and clearing context', () => {
      const repo = createMockTimingRepo();
      // Should not throw
      setPhaseTimingContext('run-1', repo);
      clearPhaseTimingContext();
    });
  });

  describe('recordPhaseStart', () => {
    it('should save a timing record when context is set', async () => {
      const repo = createMockTimingRepo();
      setPhaseTimingContext('run-1', repo);

      const timingId = await recordPhaseStart('analyze');

      expect(timingId).toBeDefined();
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          agentRunId: 'run-1',
          phase: 'analyze',
          startedAt: expect.any(Date),
        })
      );
    });

    it('should return null when context is not set', async () => {
      const timingId = await recordPhaseStart('analyze');
      expect(timingId).toBeNull();
    });

    it('should return null and not throw when save fails', async () => {
      const repo = createMockTimingRepo();
      (repo.save as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
      setPhaseTimingContext('run-1', repo);

      const timingId = await recordPhaseStart('analyze');
      expect(timingId).toBeNull();
    });
  });

  describe('recordPhaseEnd', () => {
    it('should update timing record with completedAt and durationMs', async () => {
      const repo = createMockTimingRepo();
      setPhaseTimingContext('run-1', repo);

      const timingId = await recordPhaseStart('plan');
      expect(timingId).not.toBeNull();

      await recordPhaseEnd(timingId!, 1500);

      expect(repo.update).toHaveBeenCalledWith(timingId!, {
        completedAt: expect.any(Date),
        durationMs: BigInt(1500),
      });
    });

    it('should not throw when update fails', async () => {
      const repo = createMockTimingRepo();
      (repo.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
      setPhaseTimingContext('run-1', repo);

      const timingId = await recordPhaseStart('plan');
      // Should not throw
      await recordPhaseEnd(timingId!, 1000);
    });

    it('should be a no-op when timingId is null', async () => {
      const repo = createMockTimingRepo();
      setPhaseTimingContext('run-1', repo);

      await recordPhaseEnd(null, 1000);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('recordApprovalWaitStart', () => {
    it('should call updateApprovalWait with waitingApprovalAt timestamp', async () => {
      const repo = createMockTimingRepo();
      setPhaseTimingContext('run-1', repo);

      await recordApprovalWaitStart('timing-1');

      expect(repo.updateApprovalWait).toHaveBeenCalledWith('timing-1', {
        waitingApprovalAt: expect.any(Date),
      });
    });

    it('should be a no-op when timingId is null', async () => {
      const repo = createMockTimingRepo();
      setPhaseTimingContext('run-1', repo);

      await recordApprovalWaitStart(null);
      expect(repo.updateApprovalWait).not.toHaveBeenCalled();
    });

    it('should be a no-op when context is not set', async () => {
      await recordApprovalWaitStart('timing-1');
      // No throw expected
    });

    it('should not throw when updateApprovalWait fails', async () => {
      const repo = createMockTimingRepo();
      (repo.updateApprovalWait as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB error')
      );
      setPhaseTimingContext('run-1', repo);

      await recordApprovalWaitStart('timing-1');
      // No throw expected
    });
  });

  describe('recordPhaseStart iteration naming', () => {
    it('uses bare phase name on first execution', async () => {
      const repo = createMockTimingRepo();
      setPhaseTimingContext('run-1', repo);

      await recordPhaseStart('requirements');

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ phase: 'requirements' }));
    });

    it('appends :2 suffix on second execution of same phase', async () => {
      const repo = createMockTimingRepo();
      (repo.findByRunId as ReturnType<typeof vi.fn>).mockResolvedValue([
        { phase: 'requirements', agentRunId: 'run-1' },
      ]);
      setPhaseTimingContext('run-1', repo);

      await recordPhaseStart('requirements');

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ phase: 'requirements:2' }));
    });

    it('appends :3 suffix on third execution of same phase', async () => {
      const repo = createMockTimingRepo();
      (repo.findByRunId as ReturnType<typeof vi.fn>).mockResolvedValue([
        { phase: 'requirements', agentRunId: 'run-1' },
        { phase: 'requirements:2', agentRunId: 'run-1' },
      ]);
      setPhaseTimingContext('run-1', repo);

      await recordPhaseStart('requirements');

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ phase: 'requirements:3' }));
    });

    it('does not count other phase names', async () => {
      const repo = createMockTimingRepo();
      (repo.findByRunId as ReturnType<typeof vi.fn>).mockResolvedValue([
        { phase: 'analyze', agentRunId: 'run-1' },
        { phase: 'plan', agentRunId: 'run-1' },
      ]);
      setPhaseTimingContext('run-1', repo);

      await recordPhaseStart('requirements');

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ phase: 'requirements' }));
    });

    it('falls back to bare phase name when findByRunId fails', async () => {
      const repo = createMockTimingRepo();
      (repo.findByRunId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
      setPhaseTimingContext('run-1', repo);

      await recordPhaseStart('requirements');

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ phase: 'requirements' }));
    });
  });

  describe('getLastTimingId', () => {
    it('should return null before any phase starts', () => {
      expect(getLastTimingId()).toBeNull();
    });

    it('should return the timing ID after recordPhaseStart', async () => {
      const repo = createMockTimingRepo();
      setPhaseTimingContext('run-1', repo);

      const timingId = await recordPhaseStart('analyze');
      expect(getLastTimingId()).toBe(timingId);
    });

    it('should return null after clearPhaseTimingContext', async () => {
      const repo = createMockTimingRepo();
      setPhaseTimingContext('run-1', repo);
      await recordPhaseStart('analyze');

      clearPhaseTimingContext();
      expect(getLastTimingId()).toBeNull();
    });

    it('should return null when recordPhaseStart fails', async () => {
      const repo = createMockTimingRepo();
      (repo.save as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
      setPhaseTimingContext('run-1', repo);

      await recordPhaseStart('analyze');
      expect(getLastTimingId()).toBeNull();
    });
  });
});
