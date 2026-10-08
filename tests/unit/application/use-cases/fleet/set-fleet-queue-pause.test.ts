/**
 * SetFleetQueuePauseUseCase Unit Tests
 *
 * The single writer for `workflow.queuePaused`. Two callers share it: the
 * circuit breaker (pause only) and `shep fleet pause` / `resume`.
 *
 * Properties that matter:
 *  - pausing is idempotent and preserves the ORIGINAL pausedAt, so a sweep that
 *    re-reads a tripped breaker every few seconds does not keep resetting "how
 *    long has this been parked?" to zero
 *  - the user's `maxParallelFeatures` ceiling survives both directions, or
 *    resume would restore the wrong number
 *  - resume drains the queue, because clearing the pause is one of the few
 *    things that opens admission without any feature changing lifecycle
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SetFleetQueuePauseUseCase } from '@/application/use-cases/fleet/set-fleet-queue-pause.use-case.js';
import type { Settings } from '@/domain/generated/output.js';

function settingsWith(workflow: Record<string, unknown> = {}): Settings {
  return {
    workflow: { maxParallelFeatures: 8, ...workflow },
  } as unknown as Settings;
}

describe('SetFleetQueuePauseUseCase', () => {
  let settingsRepo: { load: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let admitQueued: { execute: ReturnType<typeof vi.fn> };
  let useCase: SetFleetQueuePauseUseCase;

  beforeEach(() => {
    settingsRepo = {
      load: vi.fn().mockResolvedValue(settingsWith()),
      update: vi.fn().mockResolvedValue(undefined),
    };
    admitQueued = { execute: vi.fn().mockResolvedValue({ admittedFeatureIds: [] }) };
    useCase = new SetFleetQueuePauseUseCase(settingsRepo as never, admitQueued as never);
  });

  describe('pausing', () => {
    it('records the pause with its reason and timestamp', async () => {
      const now = new Date('2026-03-01T12:00:00Z');

      const result = await useCase.execute({
        paused: true,
        reason: 'Circuit breaker tripped',
        now,
      });

      expect(result).toEqual({ pausedAt: now, reason: 'Circuit breaker tripped' });
      const written = settingsRepo.update.mock.calls[0][0] as Settings;
      expect(written.workflow.queuePaused).toEqual({
        pausedAt: now,
        reason: 'Circuit breaker tripped',
      });
    });

    it('preserves the configured ceiling instead of overwriting it', async () => {
      await useCase.execute({ paused: true, reason: 'tripped' });

      const written = settingsRepo.update.mock.calls[0][0] as Settings;
      expect(written.workflow.maxParallelFeatures).toBe(8);
    });

    it('does not admit anything on pause', async () => {
      await useCase.execute({ paused: true, reason: 'tripped' });

      expect(admitQueued.execute).not.toHaveBeenCalled();
    });

    it('keeps the original pausedAt when the trip is observed again', async () => {
      // The breaker is re-evaluated on every status read; re-stamping here would
      // make "paused 40 minutes ago" read as "paused just now", forever.
      const original = new Date('2026-03-01T12:00:00Z');
      settingsRepo.load.mockResolvedValue(
        settingsWith({ queuePaused: { pausedAt: original, reason: 'first trip' } })
      );

      const result = await useCase.execute({
        paused: true,
        reason: 'second observation',
        now: new Date('2026-03-01T12:30:00Z'),
      });

      expect(result).toEqual({ pausedAt: original, reason: 'first trip' });
      expect(settingsRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('resuming', () => {
    it('clears the pause record', async () => {
      settingsRepo.load.mockResolvedValue(
        settingsWith({
          queuePaused: { pausedAt: new Date('2026-03-01T12:00:00Z'), reason: 'tripped' },
        })
      );

      const result = await useCase.execute({ paused: false });

      expect(result).toBeNull();
      const written = settingsRepo.update.mock.calls[0][0] as Settings;
      expect(written.workflow.queuePaused).toBeUndefined();
      expect('queuePaused' in written.workflow).toBe(false);
    });

    it('restores the ceiling the user configured', async () => {
      settingsRepo.load.mockResolvedValue(
        settingsWith({ queuePaused: { pausedAt: new Date(), reason: 'tripped' } })
      );

      await useCase.execute({ paused: false });

      const written = settingsRepo.update.mock.calls[0][0] as Settings;
      expect(written.workflow.maxParallelFeatures).toBe(8);
    });

    /**
     * Without this, resume cannot stick: the breaker reads a rolling window of
     * `agent_runs`, nothing there records that a human has looked, so the next
     * status read sees the same failures and re-parks the queue. On the web that
     * read fires on every dashboard render and every SSE agent event.
     */
    it('acknowledges the trip so the same failures cannot re-park the queue', async () => {
      const resumedAt = new Date('2026-03-01T12:30:00Z');
      settingsRepo.load.mockResolvedValue(
        settingsWith({ queuePaused: { pausedAt: new Date(), reason: 'tripped' } })
      );

      await useCase.execute({ paused: false, now: resumedAt });

      const written = settingsRepo.update.mock.calls[0][0] as Settings;
      expect(written.workflow.breakerAcknowledgedAt).toEqual(resumedAt);
    });

    it('does not move the acknowledgement on a no-op resume', async () => {
      // Nothing was parked, so there is no trip to acknowledge — and no write
      // worth making.
      await useCase.execute({ paused: false, now: new Date('2026-03-01T12:30:00Z') });

      expect(settingsRepo.update).not.toHaveBeenCalled();
    });

    it('drains the queue once admission is open again', async () => {
      settingsRepo.load.mockResolvedValue(
        settingsWith({ queuePaused: { pausedAt: new Date(), reason: 'tripped' } })
      );

      await useCase.execute({ paused: false });

      expect(admitQueued.execute).toHaveBeenCalledOnce();
    });

    it('is a no-op when the queue was not paused', async () => {
      const result = await useCase.execute({ paused: false });

      expect(result).toBeNull();
      expect(settingsRepo.update).not.toHaveBeenCalled();
      // Still worth draining: the user asked for the fleet to be running.
      expect(admitQueued.execute).toHaveBeenCalledOnce();
    });

    it('reports success even when the drain cannot start anything yet', async () => {
      // Resume must not look like it failed because a queued feature's own
      // dependency gate is still shut.
      settingsRepo.load.mockResolvedValue(
        settingsWith({ queuePaused: { pausedAt: new Date(), reason: 'tripped' } })
      );
      admitQueued.execute.mockRejectedValue(new Error('spawn blew up'));

      await expect(useCase.execute({ paused: false })).resolves.toBeNull();
    });
  });

  it('fails loudly when settings were never initialised', async () => {
    settingsRepo.load.mockResolvedValue(null);

    await expect(useCase.execute({ paused: true, reason: 'tripped' })).rejects.toThrow(/settings/i);
    expect(settingsRepo.update).not.toHaveBeenCalled();
  });
});
