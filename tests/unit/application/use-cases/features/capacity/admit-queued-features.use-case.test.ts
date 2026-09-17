/**
 * AdmitQueuedFeaturesUseCase Unit Tests
 *
 * The drain must satisfy four properties that are easy to get wrong:
 *  - FIFO, and it stops exactly at the limit (never over-admits)
 *  - a queued feature whose parent gate is closed keeps its place and does NOT
 *    consume the slot — the next one takes it
 *  - one failing spawn does not strand the rest of the queue
 *  - nothing in this path can stop a running agent
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AdmitQueuedFeaturesUseCase } from '@/application/use-cases/features/capacity/admit-queued-features.use-case.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';
import { createMockFeatureRepository } from '../../../../../helpers/feature-repository.mock.js';

function queuedFeature(id: string, minutesAgo: number, overrides?: Partial<Feature>): Feature {
  return {
    id,
    name: id,
    slug: id,
    description: '',
    userQuery: '',
    repositoryPath: '/repo',
    branch: `feat/${id}`,
    lifecycle: SdlcLifecycle.Pending,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    agentRunId: `run-${id}`,
    specPath: `/repo/specs/${id}`,
    queuedAt: new Date(Date.now() - minutesAgo * 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AdmitQueuedFeaturesUseCase', () => {
  let featureRepo: ReturnType<typeof createMockFeatureRepository>;
  let capacity: { getLimit: ReturnType<typeof vi.fn>; getRunningCount: ReturnType<typeof vi.fn> };
  let spawnFeatureAgent: { execute: ReturnType<typeof vi.fn> };
  let useCase: AdmitQueuedFeaturesUseCase;

  beforeEach(() => {
    featureRepo = createMockFeatureRepository();
    capacity = {
      getLimit: vi.fn().mockResolvedValue(3),
      getRunningCount: vi.fn().mockResolvedValue(0),
    };
    spawnFeatureAgent = { execute: vi.fn().mockResolvedValue({ spawned: true }) };
    useCase = new AdmitQueuedFeaturesUseCase(
      featureRepo as never,
      capacity as never,
      spawnFeatureAgent as never
    );
  });

  it('admits nothing when the queue is empty', async () => {
    const result = await useCase.execute();

    expect(result.admittedFeatureIds).toEqual([]);
    expect(spawnFeatureAgent.execute).not.toHaveBeenCalled();
  });

  it('admits queued features in FIFO order', async () => {
    featureRepo.listQueued.mockResolvedValue([
      queuedFeature('first', 30),
      queuedFeature('second', 10),
    ]);

    const result = await useCase.execute();

    expect(result.admittedFeatureIds).toEqual(['first', 'second']);
  });

  it('stops exactly at the limit', async () => {
    capacity.getLimit.mockResolvedValue(2);
    capacity.getRunningCount.mockResolvedValue(1);
    featureRepo.listQueued.mockResolvedValue([
      queuedFeature('a', 30),
      queuedFeature('b', 20),
      queuedFeature('c', 10),
    ]);

    const result = await useCase.execute();

    expect(result.admittedFeatureIds).toEqual(['a']);
    expect(spawnFeatureAgent.execute).toHaveBeenCalledOnce();
  });

  it('does not re-query the running count per feature (it would race with the spawns)', async () => {
    capacity.getLimit.mockResolvedValue(5);
    featureRepo.listQueued.mockResolvedValue([queuedFeature('a', 30), queuedFeature('b', 20)]);

    await useCase.execute();

    expect(capacity.getRunningCount).toHaveBeenCalledOnce();
  });

  it('drains the whole queue when the limit is unlimited', async () => {
    capacity.getLimit.mockResolvedValue(0);
    featureRepo.listQueued.mockResolvedValue([
      queuedFeature('a', 30),
      queuedFeature('b', 20),
      queuedFeature('c', 10),
    ]);

    const result = await useCase.execute();

    expect(result.admittedFeatureIds).toEqual(['a', 'b', 'c']);
    expect(capacity.getRunningCount).not.toHaveBeenCalled();
  });

  it('clears queuedAt and transitions the feature before spawning', async () => {
    featureRepo.listQueued.mockResolvedValue([queuedFeature('a', 30)]);

    await useCase.execute();

    const persisted = featureRepo.update.mock.calls[0][0];
    expect(persisted.queuedAt).toBeUndefined();
    expect(persisted.lifecycle).toBe(SdlcLifecycle.Requirements);
  });

  it('sends a fast-mode feature straight to Implementation', async () => {
    featureRepo.listQueued.mockResolvedValue([
      queuedFeature('a', 30, { buildMode: BuildMode.Fast }),
    ]);

    await useCase.execute();

    expect(featureRepo.update.mock.calls[0][0].lifecycle).toBe(SdlcLifecycle.Implementation);
  });

  it('sends an exploration feature back to Exploring', async () => {
    featureRepo.listQueued.mockResolvedValue([
      queuedFeature('a', 30, { buildMode: BuildMode.Exploration }),
    ]);

    await useCase.execute();

    expect(featureRepo.update.mock.calls[0][0].lifecycle).toBe(SdlcLifecycle.Exploring);
  });

  describe('dependency gate', () => {
    it('leaves a queued feature whose parent has not landed in the queue', async () => {
      featureRepo.listQueued.mockResolvedValue([
        queuedFeature('child', 30, { parentId: 'parent' }),
      ]);
      featureRepo.findById.mockResolvedValue({
        id: 'parent',
        lifecycle: SdlcLifecycle.Implementation,
      });

      const result = await useCase.execute();

      expect(result.admittedFeatureIds).toEqual([]);
      expect(featureRepo.update).not.toHaveBeenCalled();
      expect(spawnFeatureAgent.execute).not.toHaveBeenCalled();
    });

    it('gives the slot to the next feature instead of holding it behind a closed gate', async () => {
      capacity.getLimit.mockResolvedValue(1);
      featureRepo.listQueued.mockResolvedValue([
        queuedFeature('blocked-child', 30, { parentId: 'parent' }),
        queuedFeature('ready', 20),
      ]);
      featureRepo.findById.mockResolvedValue({
        id: 'parent',
        lifecycle: SdlcLifecycle.Implementation,
      });

      const result = await useCase.execute();

      expect(result.admittedFeatureIds).toEqual(['ready']);
    });

    it('admits a child once its parent has landed', async () => {
      featureRepo.listQueued.mockResolvedValue([
        queuedFeature('child', 30, { parentId: 'parent' }),
      ]);
      featureRepo.findById.mockResolvedValue({
        id: 'parent',
        lifecycle: SdlcLifecycle.Maintain,
        branch: 'feat/parent',
      });

      const result = await useCase.execute();

      expect(result.admittedFeatureIds).toEqual(['child']);
      expect(spawnFeatureAgent.execute).toHaveBeenCalledWith(
        expect.objectContaining({ parentBranch: 'feat/parent' })
      );
    });

    it('treats a dangling parent reference as a closed gate', async () => {
      featureRepo.listQueued.mockResolvedValue([queuedFeature('orphan', 30, { parentId: 'gone' })]);
      featureRepo.findById.mockResolvedValue(null);

      expect((await useCase.execute()).admittedFeatureIds).toEqual([]);
    });
  });

  describe('resilience', () => {
    it('keeps draining after one feature fails to spawn', async () => {
      featureRepo.listQueued.mockResolvedValue([
        queuedFeature('bad', 30),
        queuedFeature('good', 20),
      ]);
      spawnFeatureAgent.execute
        .mockRejectedValueOnce(new Error('worker failed to fork'))
        .mockResolvedValue({ spawned: true });

      const result = await useCase.execute();

      expect(result.admittedFeatureIds).toEqual(['good']);
    });

    it('is idempotent — a second run over an emptied queue admits nothing', async () => {
      featureRepo.listQueued.mockResolvedValueOnce([queuedFeature('a', 30)]).mockResolvedValue([]);

      expect((await useCase.execute()).admittedFeatureIds).toEqual(['a']);
      expect((await useCase.execute()).admittedFeatureIds).toEqual([]);
      expect(spawnFeatureAgent.execute).toHaveBeenCalledOnce();
    });

    it('does not report a feature the spawner declined to start', async () => {
      featureRepo.listQueued.mockResolvedValue([queuedFeature('a', 30)]);
      spawnFeatureAgent.execute.mockResolvedValue({ spawned: false });

      expect((await useCase.execute()).admittedFeatureIds).toEqual([]);
    });
  });
});
