/**
 * FeatureCapacityService Unit Tests
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FeatureCapacityService } from '@/application/use-cases/features/capacity/feature-capacity.service.js';
import {
  RUNNING_LIFECYCLES,
  SLOT_RELEASING_RUN_STATUSES,
} from '@/domain/shared/parallel-feature-limit.js';
import { SdlcLifecycle } from '@/domain/generated/output.js';
import { createMockFeatureRepository } from '../../../../../helpers/feature-repository.mock.js';

const settingsWithLimit = (maxParallelFeatures?: number) => ({
  load: vi.fn().mockResolvedValue({ workflow: { maxParallelFeatures } }),
});

/** Settings with the fleet admission queue parked. */
const settingsPaused = (maxParallelFeatures?: number, reason = 'Circuit breaker tripped') => ({
  load: vi.fn().mockResolvedValue({
    workflow: {
      maxParallelFeatures,
      queuePaused: { pausedAt: '2026-03-01T12:00:00Z', reason },
    },
  }),
});

describe('FeatureCapacityService', () => {
  let featureRepo: ReturnType<typeof createMockFeatureRepository>;

  beforeEach(() => {
    featureRepo = createMockFeatureRepository();
  });

  const service = (settings: { load: ReturnType<typeof vi.fn> }) =>
    new FeatureCapacityService(featureRepo as never, settings as never);

  describe('hasCapacity', () => {
    it('is always true when the limit is unlimited, without counting', async () => {
      const capacity = service(settingsWithLimit(0));

      expect(await capacity.hasCapacity()).toBe(true);
      expect(featureRepo.countByLifecycles).not.toHaveBeenCalled();
    });

    it('is true while running is below the limit', async () => {
      featureRepo.countByLifecycles.mockResolvedValue(2);

      expect(await service(settingsWithLimit(3)).hasCapacity()).toBe(true);
    });

    it('is false once running reaches the limit', async () => {
      featureRepo.countByLifecycles.mockResolvedValue(3);

      expect(await service(settingsWithLimit(3)).hasCapacity()).toBe(false);
    });

    it('counts exactly the running lifecycles, minus features whose run finished', async () => {
      featureRepo.countByLifecycles.mockResolvedValue(1);

      await service(settingsWithLimit(3)).hasCapacity();

      expect(featureRepo.countByLifecycles).toHaveBeenCalledWith([...RUNNING_LIFECYCLES], {
        releasingRunStatuses: [...SLOT_RELEASING_RUN_STATUSES],
      });
    });

    it('treats uninitialised settings as unlimited', async () => {
      const capacity = service({ load: vi.fn().mockResolvedValue(null) });

      expect(await capacity.hasCapacity()).toBe(true);
    });
  });

  /**
   * The pause is the circuit breaker's "stop starting new work" lever. These
   * assertions exist because a paused queue resolves to a limit of 0, and 0
   * already means UNLIMITED — so a service that only compared the limit would
   * report "unlimited capacity" for a parked fleet and admit everything.
   */
  describe('paused admission queue', () => {
    it('has no capacity while paused, even with a generous configured limit', async () => {
      const capacity = service(settingsPaused(8));

      expect(await capacity.hasCapacity()).toBe(false);
    });

    it('has no capacity while paused when no ceiling was ever configured', async () => {
      const capacity = service(settingsPaused(undefined));

      expect(await capacity.hasCapacity()).toBe(false);
    });

    it('refuses to hand out a slot while paused', async () => {
      const capacity = service(settingsPaused(8));

      expect(
        await capacity.claimSlot({ featureId: 'f1', targetLifecycle: SdlcLifecycle.Requirements })
      ).toBe(false);
      expect(featureRepo.claimForStart).not.toHaveBeenCalled();
    });

    it('refuses a slot while paused even when the caller asked to bypass the cap', async () => {
      // `bypassLimit` is the user's "start anyway" and outranks the ceiling,
      // never the pause: a fleet parked because everything is failing must not
      // restart on the strength of one forced start.
      const capacity = service(settingsPaused(8));

      expect(
        await capacity.claimSlot({
          featureId: 'f1',
          targetLifecycle: SdlcLifecycle.Requirements,
          bypassLimit: true,
        })
      ).toBe(false);
      expect(featureRepo.claimForStart).not.toHaveBeenCalled();
    });

    /**
     * The pause governs ADMISSION, so it only refuses work that would occupy a
     * slot. `ResumeFeatureUseCase` passes `bypassLimit` for lifecycles outside
     * the running set — resuming a failed merge sitting in Review, say — which
     * are not asking for capacity at all. Refusing those would turn "stop
     * starting new work" into "stop finishing work already in flight".
     */
    it('still lets a non-slot lifecycle through while paused', async () => {
      const capacity = service(settingsPaused(8));

      expect(
        await capacity.claimSlot({
          featureId: 'f1',
          targetLifecycle: SdlcLifecycle.Review,
          bypassLimit: true,
        })
      ).toBe(true);
      expect(featureRepo.claimForStart).toHaveBeenCalledOnce();
    });

    it('still refuses a slot-consuming lifecycle while paused without any bypass', async () => {
      const capacity = service(settingsPaused(8));

      expect(
        await capacity.claimSlot({
          featureId: 'f1',
          targetLifecycle: SdlcLifecycle.Implementation,
        })
      ).toBe(false);
      expect(featureRepo.claimForStart).not.toHaveBeenCalled();
    });

    it('reports the queue as paused with nothing available, not as unlimited', async () => {
      featureRepo.countByLifecycles.mockResolvedValue(2);

      const snapshot = await service(settingsPaused(8)).snapshot();

      expect(snapshot).toMatchObject({
        paused: true,
        unlimited: false,
        available: 0,
        limit: 8,
        running: 2,
      });
    });

    it('keeps the user ceiling intact so resume can restore it', async () => {
      // getConfiguredLimit is what persistence and the UI read. If the pause
      // overwrote it, `fleet resume` would restore "unlimited" instead of the
      // ceiling the user actually chose.
      const capacity = service(settingsPaused(8));

      expect(await capacity.getConfiguredLimit()).toBe(8);
      expect(await capacity.getLimit()).toBe(0);
    });

    it('drains normally again once the pause record is gone', async () => {
      featureRepo.countByLifecycles.mockResolvedValue(1);

      expect(await service(settingsWithLimit(8)).hasCapacity()).toBe(true);

      const snapshot = await service(settingsWithLimit(8)).snapshot();

      expect(snapshot).toMatchObject({ paused: false, unlimited: false, available: 7, limit: 8 });
    });
  });

  describe('snapshot', () => {
    it('reports remaining slots', async () => {
      featureRepo.countByLifecycles.mockResolvedValue(1);

      const snapshot = await service(settingsWithLimit(3)).snapshot();

      expect(snapshot).toMatchObject({ limit: 3, unlimited: false, running: 1, available: 2 });
    });

    it('floors available at zero when the limit was lowered below the running count', async () => {
      // Lowering the limit never stops anything, so "available" must not go
      // negative — it is a count of what may start, not a deficit.
      featureRepo.countByLifecycles.mockResolvedValue(5);

      const snapshot = await service(settingsWithLimit(2)).snapshot();

      expect(snapshot.available).toBe(0);
      expect(snapshot.running).toBe(5);
    });

    it('reports null available when unlimited', async () => {
      const snapshot = await service(settingsWithLimit(0)).snapshot();

      expect(snapshot.unlimited).toBe(true);
      expect(snapshot.available).toBeNull();
    });

    it('numbers the queue from 1 in listQueued order', async () => {
      featureRepo.listQueued.mockResolvedValue([
        { id: 'first', queuedAt: new Date('2026-03-01T10:00:00Z') },
        { id: 'second', queuedAt: new Date('2026-03-01T11:00:00Z') },
      ]);

      const snapshot = await service(settingsWithLimit(1)).snapshot();

      expect(snapshot.queue).toEqual([
        { featureId: 'first', position: 1, queuedAt: new Date('2026-03-01T10:00:00Z') },
        { featureId: 'second', position: 2, queuedAt: new Date('2026-03-01T11:00:00Z') },
      ]);
    });

    it('asks the repository for the queue once, not once per feature', async () => {
      featureRepo.listQueued.mockResolvedValue([
        { id: 'a', queuedAt: new Date() },
        { id: 'b', queuedAt: new Date() },
        { id: 'c', queuedAt: new Date() },
      ]);

      await service(settingsWithLimit(1)).snapshot();

      expect(featureRepo.listQueued).toHaveBeenCalledOnce();
    });
  });

  describe('getQueuePosition', () => {
    beforeEach(() => {
      featureRepo.listQueued.mockResolvedValue([
        { id: 'first', queuedAt: new Date('2026-03-01T10:00:00Z') },
        { id: 'second', queuedAt: new Date('2026-03-01T11:00:00Z') },
      ]);
    });

    it('returns the 1-based place in the queue', async () => {
      const capacity = service(settingsWithLimit(1));

      expect(await capacity.getQueuePosition('first')).toBe(1);
      expect(await capacity.getQueuePosition('second')).toBe(2);
    });

    it('returns undefined for a feature that is not queued', async () => {
      expect(await service(settingsWithLimit(1)).getQueuePosition('other')).toBeUndefined();
    });
  });
});
