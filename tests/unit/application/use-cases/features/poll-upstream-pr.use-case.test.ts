/**
 * PollUpstreamPrUseCase Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollUpstreamPrUseCase } from '@/application/use-cases/features/poll-upstream-pr.use-case';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface';
import type { IGitForkService } from '@/application/ports/output/services/git-fork-service.interface';
import type { Feature } from '@/domain/generated/output';
import { SdlcLifecycle, PrStatus, FeatureMode } from '@/domain/generated/output';

function createMockFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    name: 'Test Feature',
    userQuery: 'test',
    slug: 'test-feature',
    description: 'A test feature',
    repositoryPath: '/repo/path',
    branch: 'feat/test',
    lifecycle: SdlcLifecycle.AwaitingUpstream,
    messages: [],
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    iterationCount: 0,
    push: true,
    openPr: true,
    forkAndPr: true,
    commitSpecs: false,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    pr: {
      url: 'https://github.com/fork-owner/repo/pull/5',
      number: 5,
      status: PrStatus.Open,
      upstreamPrUrl: 'https://github.com/upstream-owner/repo/pull/42',
      upstreamPrNumber: 42,
      upstreamPrStatus: PrStatus.Open,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PollUpstreamPrUseCase', () => {
  let featureRepo: IFeatureRepository;
  let forkService: IGitForkService;
  let useCase: PollUpstreamPrUseCase;

  beforeEach(() => {
    featureRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByIdPrefix: vi.fn(),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      findByParentId: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
    };
    forkService = {
      forkRepository: vi.fn(),
      pushToFork: vi.fn(),
      createUpstreamPr: vi.fn(),
      getUpstreamPrStatus: vi.fn(),
    };
    useCase = new PollUpstreamPrUseCase(featureRepo, forkService);
  });

  it('should transition feature to Maintain when upstream PR is merged', async () => {
    const feature = createMockFeature();
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);
    vi.mocked(forkService.getUpstreamPrStatus).mockResolvedValue(PrStatus.Merged);

    const result = await useCase.execute({ featureId: 'feat-1' });

    expect(result).toEqual({ status: 'merged', transitioned: true });
    expect(featureRepo.update).toHaveBeenCalledTimes(1);
    const updated = vi.mocked(featureRepo.update).mock.calls[0][0];
    expect(updated.lifecycle).toBe(SdlcLifecycle.Maintain);
    expect(updated.pr!.upstreamPrStatus).toBe(PrStatus.Merged);
  });

  it('should update status to Closed but stay in AwaitingUpstream when PR is closed', async () => {
    const feature = createMockFeature();
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);
    vi.mocked(forkService.getUpstreamPrStatus).mockResolvedValue(PrStatus.Closed);

    const result = await useCase.execute({ featureId: 'feat-1' });

    expect(result).toEqual({ status: 'closed', transitioned: false });
    expect(featureRepo.update).toHaveBeenCalledTimes(1);
    const updated = vi.mocked(featureRepo.update).mock.calls[0][0];
    expect(updated.lifecycle).toBe(SdlcLifecycle.AwaitingUpstream);
    expect(updated.pr!.upstreamPrStatus).toBe(PrStatus.Closed);
  });

  it('should return no-op when upstream PR is still open', async () => {
    const feature = createMockFeature();
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);
    vi.mocked(forkService.getUpstreamPrStatus).mockResolvedValue(PrStatus.Open);

    const result = await useCase.execute({ featureId: 'feat-1' });

    expect(result).toEqual({ status: 'open', transitioned: false });
    expect(featureRepo.update).not.toHaveBeenCalled();
  });

  it('should return early when feature is not found', async () => {
    vi.mocked(featureRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({ featureId: 'nonexistent' });

    expect(result).toEqual({ status: 'open', transitioned: false });
    expect(forkService.getUpstreamPrStatus).not.toHaveBeenCalled();
  });

  it('should return early when feature is not in AwaitingUpstream lifecycle', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Review });
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);

    const result = await useCase.execute({ featureId: 'feat-1' });

    expect(result).toEqual({ status: 'open', transitioned: false });
    expect(forkService.getUpstreamPrStatus).not.toHaveBeenCalled();
  });

  it('should return early when feature has no upstream PR URL', async () => {
    const feature = createMockFeature({
      pr: {
        url: 'https://github.com/fork-owner/repo/pull/5',
        number: 5,
        status: PrStatus.Open,
      },
    });
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);

    const result = await useCase.execute({ featureId: 'feat-1' });

    expect(result).toEqual({ status: 'open', transitioned: false });
    expect(forkService.getUpstreamPrStatus).not.toHaveBeenCalled();
  });

  it('should return early when upstream PR URL cannot be parsed', async () => {
    const feature = createMockFeature({
      pr: {
        url: 'https://github.com/fork-owner/repo/pull/5',
        number: 5,
        status: PrStatus.Open,
        upstreamPrUrl: 'https://invalid-url.com/not-github',
        upstreamPrNumber: 42,
      },
    });
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);

    const result = await useCase.execute({ featureId: 'feat-1' });

    expect(result).toEqual({ status: 'open', transitioned: false });
    expect(forkService.getUpstreamPrStatus).not.toHaveBeenCalled();
  });

  it('should extract correct upstream repo from PR URL', async () => {
    const feature = createMockFeature({
      pr: {
        url: 'https://github.com/fork/repo/pull/5',
        number: 5,
        status: PrStatus.Open,
        upstreamPrUrl: 'https://github.com/upstream-org/my-project/pull/99',
        upstreamPrNumber: 99,
      },
    });
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);
    vi.mocked(forkService.getUpstreamPrStatus).mockResolvedValue(PrStatus.Open);

    await useCase.execute({ featureId: 'feat-1' });

    expect(forkService.getUpstreamPrStatus).toHaveBeenCalledWith('upstream-org/my-project', 99);
  });
});
