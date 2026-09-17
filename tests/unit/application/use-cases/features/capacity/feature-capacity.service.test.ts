/**
 * FeatureCapacityService Unit Tests
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FeatureCapacityService } from '@/application/use-cases/features/capacity/feature-capacity.service.js';
import { RUNNING_LIFECYCLES } from '@/domain/shared/parallel-feature-limit.js';
import { createMockFeatureRepository } from '../../../../../helpers/feature-repository.mock.js';

const settingsWithLimit = (maxParallelFeatures?: number) => ({
  load: vi.fn().mockResolvedValue({ workflow: { maxParallelFeatures } }),
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

    it('counts exactly the running lifecycles', async () => {
      featureRepo.countByLifecycles.mockResolvedValue(1);

      await service(settingsWithLimit(3)).hasCapacity();

      expect(featureRepo.countByLifecycles).toHaveBeenCalledWith([...RUNNING_LIFECYCLES]);
    });

    it('treats uninitialised settings as unlimited', async () => {
      const capacity = service({ load: vi.fn().mockResolvedValue(null) });

      expect(await capacity.hasCapacity()).toBe(true);
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
