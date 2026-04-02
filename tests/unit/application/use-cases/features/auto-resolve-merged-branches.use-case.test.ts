/**
 * AutoResolveMergedBranchesUseCase Unit Tests
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoResolveMergedBranchesUseCase } from '@/application/use-cases/features/auto-resolve-merged-branches.use-case';
import { type UpdateFeatureLifecycleUseCase } from '@/application/use-cases/features/update/update-feature-lifecycle.use-case';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface';
import type { Feature } from '@/domain/generated/output';
import { SdlcLifecycle, PrStatus, AgentRunStatus, FeatureMode } from '@/domain/generated/output';

function createMockFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    name: 'Test Feature',
    userQuery: 'test',
    slug: 'test-feature',
    description: 'A test feature',
    repositoryPath: '/repo/path',
    branch: 'feat/test',
    lifecycle: SdlcLifecycle.Review,
    messages: [],
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    iterationCount: 0,
    push: true,
    openPr: true,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockFeatureRepo(): IFeatureRepository {
  return {
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
}

function createMockGitPrService(): IGitPrService {
  return {
    hasRemote: vi.fn().mockResolvedValue(true),
    getRemoteUrl: vi.fn(),
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
    revParse: vi.fn(),
    hasUncommittedChanges: vi.fn(),
    commitAll: vi.fn(),
    push: vi.fn(),
    createPr: vi.fn(),
    mergePr: vi.fn(),
    mergeBranch: vi.fn(),
    getCiStatus: vi.fn(),
    watchCi: vi.fn(),
    deleteBranch: vi.fn(),
    getPrDiffSummary: vi.fn(),
    getFileDiffs: vi.fn(),
    listPrStatuses: vi.fn().mockResolvedValue([]),
    verifyMerge: vi.fn().mockResolvedValue(false),
    localMergeSquash: vi.fn(),
    getMergeableStatus: vi.fn(),
    getFailureLogs: vi.fn(),
    syncMain: vi.fn(),
    rebaseOnMain: vi.fn(),
    getConflictedFiles: vi.fn(),
    stageFiles: vi.fn(),
    rebaseContinue: vi.fn(),
    rebaseAbort: vi.fn(),
    stash: vi.fn(),
    stashPop: vi.fn(),
    stashDrop: vi.fn(),
    getBranchSyncStatus: vi.fn(),
  };
}

function createMockAgentRunRepo(): IAgentRunRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByThreadId: vi.fn(),
    updateStatus: vi.fn(),
    updatePinnedConfig: vi.fn(),
    findRunningByPid: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  };
}

describe('AutoResolveMergedBranchesUseCase', () => {
  let featureRepo: IFeatureRepository;
  let gitPrService: IGitPrService;
  let agentRunRepo: IAgentRunRepository;
  let updateLifecycle: UpdateFeatureLifecycleUseCase;
  let useCase: AutoResolveMergedBranchesUseCase;

  beforeEach(() => {
    featureRepo = createMockFeatureRepo();
    gitPrService = createMockGitPrService();
    agentRunRepo = createMockAgentRunRepo();
    updateLifecycle = {
      execute: vi.fn(),
    } as unknown as UpdateFeatureLifecycleUseCase;
    useCase = new AutoResolveMergedBranchesUseCase(
      featureRepo,
      gitPrService,
      agentRunRepo,
      updateLifecycle
    );
  });

  it('should return zero resolved when no features are in Review', async () => {
    const features = [
      createMockFeature({ id: 'f1', lifecycle: SdlcLifecycle.Implementation }),
      createMockFeature({ id: 'f2', lifecycle: SdlcLifecycle.Maintain }),
    ];

    const result = await useCase.execute(features);

    expect(result).toEqual({ resolvedCount: 0, resolvedFeatureIds: [] });
    expect(gitPrService.listPrStatuses).not.toHaveBeenCalled();
  });

  it('should return zero resolved when features list is empty', async () => {
    const result = await useCase.execute([]);

    expect(result).toEqual({ resolvedCount: 0, resolvedFeatureIds: [] });
  });

  it('should resolve a feature when its PR is merged (by PR number)', async () => {
    const feature = createMockFeature({
      id: 'feat-merged',
      pr: { url: 'https://github.com/owner/repo/pull/10', number: 10, status: PrStatus.Open },
    });
    vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
      {
        number: 10,
        state: PrStatus.Merged,
        url: 'https://github.com/owner/repo/pull/10',
        headRefName: 'feat/test',
      },
    ]);
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);

    const result = await useCase.execute([feature]);

    expect(result.resolvedCount).toBe(1);
    expect(result.resolvedFeatureIds).toContain('feat-merged');
    expect(updateLifecycle.execute).toHaveBeenCalledWith({
      featureId: 'feat-merged',
      lifecycle: SdlcLifecycle.Maintain,
    });
  });

  it('should resolve a feature when its branch matches a merged PR (no PR data)', async () => {
    const feature = createMockFeature({
      id: 'feat-no-pr',
      branch: 'feat/my-branch',
      pr: undefined,
    });
    vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
      {
        number: 20,
        state: PrStatus.Merged,
        url: 'https://github.com/owner/repo/pull/20',
        headRefName: 'feat/my-branch',
      },
    ]);
    // findById called during branch-match resolution and again in resolveFeature
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);

    const result = await useCase.execute([feature]);

    expect(result.resolvedCount).toBe(1);
    expect(result.resolvedFeatureIds).toContain('feat-no-pr');
  });

  it('should resolve a feature via local merge verification when no PR match', async () => {
    const feature = createMockFeature({
      id: 'feat-local',
      branch: 'feat/local-only',
      pr: undefined,
    });
    vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([]);
    vi.mocked(gitPrService.getDefaultBranch).mockResolvedValue('main');
    vi.mocked(gitPrService.verifyMerge).mockResolvedValue(true);
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);

    const result = await useCase.execute([feature]);

    expect(result.resolvedCount).toBe(1);
    expect(gitPrService.verifyMerge).toHaveBeenCalledWith('/repo/path', 'feat/local-only', 'main');
  });

  it('should not resolve a feature when PR is still Open', async () => {
    const feature = createMockFeature({
      id: 'feat-open',
      pr: { url: 'https://github.com/owner/repo/pull/5', number: 5, status: PrStatus.Open },
    });
    vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
      {
        number: 5,
        state: PrStatus.Open,
        url: 'https://github.com/owner/repo/pull/5',
        headRefName: 'feat/test',
      },
    ]);
    vi.mocked(gitPrService.verifyMerge).mockResolvedValue(false);

    const result = await useCase.execute([feature]);

    expect(result.resolvedCount).toBe(0);
    expect(updateLifecycle.execute).not.toHaveBeenCalled();
  });

  it('should skip features without repositoryPath', async () => {
    const feature = createMockFeature({
      id: 'feat-no-repo',
      repositoryPath: '',
    });

    const result = await useCase.execute([feature]);

    expect(result.resolvedCount).toBe(0);
    expect(gitPrService.listPrStatuses).not.toHaveBeenCalled();
  });

  it('should handle repos without a remote gracefully', async () => {
    const feature = createMockFeature({ id: 'feat-no-remote' });
    vi.mocked(gitPrService.hasRemote).mockResolvedValue(false);
    vi.mocked(gitPrService.getDefaultBranch).mockResolvedValue('main');
    vi.mocked(gitPrService.verifyMerge).mockResolvedValue(true);
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);

    const result = await useCase.execute([feature]);

    // Falls back to local merge check
    expect(result.resolvedCount).toBe(1);
    expect(gitPrService.listPrStatuses).not.toHaveBeenCalled();
    expect(gitPrService.verifyMerge).toHaveBeenCalled();
  });

  it('should handle listPrStatuses failure by falling back to local check', async () => {
    const feature = createMockFeature({ id: 'feat-gh-fail' });
    vi.mocked(gitPrService.listPrStatuses).mockRejectedValue(new Error('gh not found'));
    vi.mocked(gitPrService.getDefaultBranch).mockResolvedValue('main');
    vi.mocked(gitPrService.verifyMerge).mockResolvedValue(true);
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);

    const result = await useCase.execute([feature]);

    expect(result.resolvedCount).toBe(1);
    expect(gitPrService.verifyMerge).toHaveBeenCalled();
  });

  it('should handle verifyMerge failure gracefully', async () => {
    const feature = createMockFeature({
      id: 'feat-verify-fail',
      pr: undefined,
    });
    vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([]);
    vi.mocked(gitPrService.getDefaultBranch).mockResolvedValue('main');
    vi.mocked(gitPrService.verifyMerge).mockRejectedValue(new Error('branch not found'));

    const result = await useCase.execute([feature]);

    expect(result.resolvedCount).toBe(0);
  });

  it('should batch features by repository for efficient PR status queries', async () => {
    const f1 = createMockFeature({ id: 'f1', repositoryPath: '/repo/a', branch: 'feat/a' });
    const f2 = createMockFeature({ id: 'f2', repositoryPath: '/repo/a', branch: 'feat/b' });
    const f3 = createMockFeature({ id: 'f3', repositoryPath: '/repo/b', branch: 'feat/c' });

    vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([]);
    vi.mocked(gitPrService.verifyMerge).mockResolvedValue(false);

    await useCase.execute([f1, f2, f3]);

    // Should call listPrStatuses once per unique repo
    expect(gitPrService.listPrStatuses).toHaveBeenCalledTimes(2);
    expect(gitPrService.listPrStatuses).toHaveBeenCalledWith('/repo/a');
    expect(gitPrService.listPrStatuses).toHaveBeenCalledWith('/repo/b');
  });

  it('should not resolve a feature already transitioned to Maintain by another process', async () => {
    const feature = createMockFeature({
      id: 'feat-raced',
      pr: { url: 'https://github.com/o/r/pull/1', number: 1, status: PrStatus.Open },
    });
    vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
      {
        number: 1,
        state: PrStatus.Merged,
        url: 'https://github.com/o/r/pull/1',
        headRefName: 'feat/test',
      },
    ]);
    // Simulate race: re-fetch shows Maintain
    vi.mocked(featureRepo.findById).mockResolvedValue({
      ...feature,
      lifecycle: SdlcLifecycle.Maintain,
    });

    const result = await useCase.execute([feature]);

    expect(result.resolvedCount).toBe(0);
    expect(updateLifecycle.execute).not.toHaveBeenCalled();
  });

  it('should mark agent run as completed when resolving a feature', async () => {
    const feature = createMockFeature({
      id: 'feat-with-run',
      agentRunId: 'run-123',
      pr: { url: 'https://github.com/o/r/pull/1', number: 1, status: PrStatus.Open },
    });
    vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
      {
        number: 1,
        state: PrStatus.Merged,
        url: 'https://github.com/o/r/pull/1',
        headRefName: 'feat/test',
      },
    ]);
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);

    await useCase.execute([feature]);

    expect(agentRunRepo.updateStatus).toHaveBeenCalledWith('run-123', AgentRunStatus.completed);
  });

  it('should not fail if agent run update fails', async () => {
    const feature = createMockFeature({
      id: 'feat-run-fail',
      agentRunId: 'run-999',
      pr: { url: 'https://github.com/o/r/pull/2', number: 2, status: PrStatus.Open },
    });
    vi.mocked(gitPrService.listPrStatuses).mockResolvedValue([
      {
        number: 2,
        state: PrStatus.Merged,
        url: 'https://github.com/o/r/pull/2',
        headRefName: 'feat/test',
      },
    ]);
    vi.mocked(featureRepo.findById).mockResolvedValue(feature);
    vi.mocked(agentRunRepo.updateStatus).mockRejectedValue(new Error('already completed'));

    const result = await useCase.execute([feature]);

    // Should still count as resolved despite agent run update failure
    expect(result.resolvedCount).toBe(1);
  });

  it('should handle hasRemote throwing an error', async () => {
    const feature = createMockFeature({ id: 'feat-remote-err' });
    vi.mocked(gitPrService.hasRemote).mockRejectedValue(new Error('git not found'));

    const result = await useCase.execute([feature]);

    expect(result.resolvedCount).toBe(0);
  });
});
