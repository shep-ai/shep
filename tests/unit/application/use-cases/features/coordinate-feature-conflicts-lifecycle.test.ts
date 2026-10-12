import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { UpdateFeatureLifecycleUseCase } from '@/application/use-cases/features/update/update-feature-lifecycle.use-case.js';
import type { CoordinateFeatureConflictsUseCase } from '@/application/use-cases/features/coordinate-feature-conflicts.use-case.js';
import type { CheckAndUnblockFeaturesUseCase } from '@/application/use-cases/features/check-and-unblock-features.use-case.js';
import type { AdmitQueuedFeaturesUseCase } from '@/application/use-cases/features/capacity/admit-queued-features.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import {
  BuildMode,
  CoordinationOutcome,
  SdlcLifecycle,
  type Feature,
} from '@/domain/generated/output.js';

function feature(): Feature {
  return {
    id: 'current',
    name: 'Current',
    slug: 'current',
    description: '',
    userQuery: '',
    repositoryPath: '/repo',
    branch: 'feat/current',
    lifecycle: SdlcLifecycle.Planning,
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('S2 coordination lifecycle hook', () => {
  function setup() {
    const stored = feature();
    const repo = {
      findById: vi.fn().mockResolvedValue(stored),
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as IFeatureRepository;
    const unblock = {
      execute: vi.fn().mockResolvedValue([]),
    } as unknown as CheckAndUnblockFeaturesUseCase;
    const queued = {
      execute: vi.fn().mockResolvedValue({}),
    } as unknown as AdmitQueuedFeaturesUseCase;
    const coordinator = {
      execute: vi.fn().mockResolvedValue(CoordinationOutcome.Continued),
    } as unknown as CoordinateFeatureConflictsUseCase;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as ILogger;
    const subject = new UpdateFeatureLifecycleUseCase(repo, unblock, queued, logger, coordinator);
    return { subject, coordinator, repo, logger };
  }

  it('consults the coordinator once on an implementation transition (it reads the flag)', async () => {
    const { subject, coordinator, repo } = setup();
    await subject.execute({ featureId: 'current', lifecycle: SdlcLifecycle.Implementation });
    expect(repo.update).toHaveBeenCalledOnce();
    expect(coordinator.execute).toHaveBeenCalledOnce();
    expect(coordinator.execute).toHaveBeenCalledWith('current');
  });

  it('does not run the coordinator for ordinary research transitions', async () => {
    const { subject, coordinator } = setup();
    await subject.execute({ featureId: 'current', lifecycle: SdlcLifecycle.Research });
    expect(coordinator.execute).not.toHaveBeenCalled();
  });

  it('isolates unavailable coordination from the lifecycle transition', async () => {
    const { subject, coordinator, repo, logger } = setup();
    vi.mocked(coordinator.execute).mockRejectedValue(new Error('model unavailable'));
    await expect(
      subject.execute({
        featureId: 'current',
        lifecycle: SdlcLifecycle.Implementation,
      })
    ).resolves.toBeUndefined();
    expect(repo.update).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
