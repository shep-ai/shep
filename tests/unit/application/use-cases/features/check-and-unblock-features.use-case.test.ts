/**
 * CheckAndUnblockFeaturesUseCase Unit Tests
 *
 * Verifies idempotent auto-unblocking behaviour:
 * - No-op when parent lifecycle is below Implementation gate
 * - No-op when no blocked children exist
 * - Transitions Blocked children to Started and calls spawn()
 * - Does not touch non-Blocked children
 * - Idempotent: second call finds no blocked children → spawn() called once total
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn().mockReturnValue({
    agent: { type: 'claude-code' },
    security: { mode: 'Advisory' },
  }),
}));

import { CheckAndUnblockFeaturesUseCase } from '@/application/use-cases/features/check-and-unblock-features.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IFeatureAgentProcessService } from '@/application/ports/output/agents/feature-agent-process.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { IConflictResolutionService } from '@/application/ports/output/services/conflict-resolution.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-001',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test query',
    repositoryPath: '/repo',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Implementation,
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
    agentRunId: 'run-001',
    specPath: '/repo/.shep/specs/001-test-feature',
    worktreePath: '/worktrees/test-feature',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CheckAndUnblockFeaturesUseCase', () => {
  let useCase: CheckAndUnblockFeaturesUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockAgentProcess: IFeatureAgentProcessService;
  let mockGitPrService: IGitPrService;
  let mockWorktreeService: IWorktreeService;
  let mockConflictResolution: IConflictResolutionService;
  let mockAgentRunRepo: IAgentRunRepository;
  let mockPhaseTimingRepo: IPhaseTimingRepository;

  const parentId = 'parent-001';

  beforeEach(() => {
    mockFeatureRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByIdPrefix: vi.fn(),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      list: vi.fn(),
      findByParentId: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      softDelete: vi.fn(),
    };

    mockAgentProcess = {
      spawn: vi.fn().mockReturnValue(1234),
      isAlive: vi.fn(),
      checkAndMarkCrashed: vi.fn(),
    };

    mockGitPrService = {
      getDefaultBranch: vi.fn().mockResolvedValue('main'),
      syncMain: vi.fn().mockResolvedValue(undefined),
      rebaseOnMain: vi.fn().mockResolvedValue(undefined),
      rebaseOnBranch: vi.fn().mockResolvedValue(undefined),
      hasUncommittedChanges: vi.fn(),
      hasRemote: vi.fn(),
      getRemoteUrl: vi.fn(),
      push: vi.fn(),
      createPr: vi.fn(),
      mergePr: vi.fn(),
      mergeBranch: vi.fn(),
      localMergeSquash: vi.fn(),
      getCiStatus: vi.fn(),
      watchCi: vi.fn(),
      deleteBranch: vi.fn(),
      getPrDiffSummary: vi.fn(),
      getFileDiffs: vi.fn(),
      listPrStatuses: vi.fn(),
      getMergeableStatus: vi.fn(),
      verifyMerge: vi.fn(),
      revParse: vi.fn(),
      commitAll: vi.fn(),
      getFailureLogs: vi.fn(),
      getConflictedFiles: vi.fn(),
      stageFiles: vi.fn(),
      rebaseContinue: vi.fn(),
      rebaseAbort: vi.fn(),
      stash: vi.fn().mockResolvedValue(false),
      stashPop: vi.fn().mockResolvedValue(undefined),
      getBranchSyncStatus: vi.fn(),
    } as unknown as IGitPrService;

    mockWorktreeService = {
      create: vi.fn(),
      addExisting: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(),
      exists: vi.fn().mockResolvedValue(false),
      branchExists: vi.fn(),
      remoteBranchExists: vi.fn(),
      getWorktreePath: vi.fn().mockReturnValue('/repo/.worktrees/feat-x'),
      listBranches: vi.fn(),
      prune: vi.fn(),
      ensureGitRepository: vi.fn(),
    } as unknown as IWorktreeService;

    mockConflictResolution = {
      resolve: vi.fn().mockResolvedValue(undefined),
    } as unknown as IConflictResolutionService;

    mockAgentRunRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findByIds: vi.fn().mockResolvedValue([]),
      findByThreadId: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updatePinnedConfig: vi.fn(),
      findRunningByPid: vi.fn(),
      findLatestByFeatureId: vi.fn().mockResolvedValue(null),
      list: vi.fn(),
      delete: vi.fn(),
    } as unknown as IAgentRunRepository;

    mockPhaseTimingRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      updateApprovalWait: vi.fn(),
      findByRunId: vi.fn(),
      findByFeatureId: vi.fn(),
    } as unknown as IPhaseTimingRepository;

    useCase = new CheckAndUnblockFeaturesUseCase(
      mockFeatureRepo,
      mockAgentProcess,
      { load: vi.fn().mockResolvedValue({ security: { mode: 'Advisory' } }) } as any,
      mockGitPrService,
      mockWorktreeService,
      mockConflictResolution,
      mockAgentRunRepo,
      mockPhaseTimingRepo
    );
  });

  // -------------------------------------------------------------------------
  // Gate checks — parent not in POST_IMPLEMENTATION
  // -------------------------------------------------------------------------

  it('should be a no-op when parent is not found', async () => {
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.findByParentId).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });

  it('should be a no-op when parent lifecycle is Planning (below Implementation gate)', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Planning });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.findByParentId).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });

  it('should be a no-op when parent lifecycle is Started (below gate)', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Started });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.findByParentId).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });

  it('should be a no-op when parent lifecycle is Blocked', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Blocked });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.findByParentId).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Gate satisfied — no blocked children
  // -------------------------------------------------------------------------

  it('should be a no-op when parent lifecycle is Implementation but no blocked children', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const startedChild = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Started });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([startedChild]);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.update).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Gate satisfied — blocked children present
  // -------------------------------------------------------------------------

  it('should unblock a single blocked child when parent reaches Implementation', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const blockedChild = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Blocked });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([blockedChild]);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
    const updatedFeature = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updatedFeature.id).toBe('child-001');
    expect(updatedFeature.lifecycle).toBe(SdlcLifecycle.Started);

    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    expect(mockAgentProcess.spawn).toHaveBeenCalledWith(
      'child-001',
      blockedChild.agentRunId,
      blockedChild.repositoryPath,
      blockedChild.specPath,
      blockedChild.worktreePath,
      {
        approvalGates: blockedChild.approvalGates,
        push: blockedChild.push,
        openPr: blockedChild.openPr,
        forkAndPr: blockedChild.forkAndPr,
        commitSpecs: blockedChild.commitSpecs,
        ciWatchEnabled: blockedChild.ciWatchEnabled,
        enableEvidence: blockedChild.enableEvidence,
        commitEvidence: blockedChild.commitEvidence,
        securityMode: 'Advisory',
      }
    );
  });

  it('should unblock two blocked children when parent reaches Implementation', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const child1 = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      agentRunId: 'run-1',
      specPath: '/specs/1',
    });
    const child2 = makeFeature({
      id: 'child-002',
      lifecycle: SdlcLifecycle.Blocked,
      agentRunId: 'run-2',
      specPath: '/specs/2',
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([child1, child2]);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.update).toHaveBeenCalledTimes(2);
    expect(mockAgentProcess.spawn).toHaveBeenCalledTimes(2);

    const updatedIds = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => (call[0] as Feature).id
    );
    expect(updatedIds).toContain('child-001');
    expect(updatedIds).toContain('child-002');
  });

  it('should only unblock blocked children, not already-started children', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const blockedChild = makeFeature({ id: 'blocked', lifecycle: SdlcLifecycle.Blocked });
    const startedChild = makeFeature({ id: 'started', lifecycle: SdlcLifecycle.Started });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([blockedChild, startedChild]);

    await useCase.execute(parentId);

    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
    const updatedFeature = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updatedFeature.id).toBe('blocked');
    expect(updatedFeature.lifecycle).toBe(SdlcLifecycle.Started);

    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  it('should work when parent lifecycle is Review (also in POST_IMPLEMENTATION)', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Review });
    const blockedChild = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Blocked });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([blockedChild]);

    await useCase.execute(parentId);

    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  it('should work when parent lifecycle is Maintain (also in POST_IMPLEMENTATION)', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Maintain });
    const blockedChild = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Blocked });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([blockedChild]);

    await useCase.execute(parentId);

    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  it('should be idempotent: second call finds no blocked children, spawn called once total', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const blockedChild = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Blocked });

    // First call: one blocked child
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi
      .fn()
      .mockResolvedValueOnce([blockedChild]) // first call: blocked child exists
      .mockResolvedValueOnce([{ ...blockedChild, lifecycle: SdlcLifecycle.Started }]); // second call: already started

    await useCase.execute(parentId);
    await useCase.execute(parentId);

    // spawn() called exactly once (on the first call only)
    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    // update called exactly once (on the first call only)
    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Spawn call uses correct feature fields
  // -------------------------------------------------------------------------

  it('should call spawn() with the correct feature fields from the blocked child', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const blockedChild = makeFeature({
      id: 'child-abc',
      lifecycle: SdlcLifecycle.Blocked,
      agentRunId: 'run-xyz',
      repositoryPath: '/my-repo',
      specPath: '/my-repo/specs/001-child',
      worktreePath: '/my-repo/.worktrees/child',
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([blockedChild]);

    await useCase.execute(parentId);

    expect(mockAgentProcess.spawn).toHaveBeenCalledWith(
      'child-abc',
      'run-xyz',
      '/my-repo',
      '/my-repo/specs/001-child',
      '/my-repo/.worktrees/child',
      {
        approvalGates: blockedChild.approvalGates,
        push: blockedChild.push,
        openPr: blockedChild.openPr,
        forkAndPr: blockedChild.forkAndPr,
        commitSpecs: blockedChild.commitSpecs,
        ciWatchEnabled: blockedChild.ciWatchEnabled,
        enableEvidence: blockedChild.enableEvidence,
        commitEvidence: blockedChild.commitEvidence,
        securityMode: 'Advisory',
      }
    );
  });

  it('should skip spawn() for a blocked child that has no agentRunId or specPath', async () => {
    const parent = makeFeature({ id: parentId, lifecycle: SdlcLifecycle.Implementation });
    const incompleteChild = makeFeature({
      id: 'child-no-run',
      lifecycle: SdlcLifecycle.Blocked,
      agentRunId: undefined,
      specPath: undefined,
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([incompleteChild]);

    await useCase.execute(parentId);

    // Should still update lifecycle but NOT call spawn
    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });
});
