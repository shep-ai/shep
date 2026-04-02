/**
 * DeleteFeatureUseCase Unit Tests
 *
 * Tests for deleting a feature by ID, including agent cancellation
 * and worktree cleanup.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteFeatureUseCase } from '@/application/use-cases/features/delete-feature.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { IFeatureAgentProcessService } from '@/application/ports/output/agents/feature-agent-process.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import {
  AgentRunStatus,
  AgentType,
  PrStatus,
  SdlcLifecycle,
  FeatureMode,
} from '@/domain/generated/output.js';
import type { Feature, AgentRun } from '@/domain/generated/output.js';

function createMockFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-123-full-uuid',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test user query',
    repositoryPath: '/repo',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    iterationCount: 0,
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
    ...overrides,
  };
}

function createMockAgentRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: 'run-1',
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.running,
    prompt: 'test prompt',
    threadId: 'thread-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DeleteFeatureUseCase', () => {
  let useCase: DeleteFeatureUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockWorktreeService: IWorktreeService;
  let mockProcessService: IFeatureAgentProcessService;
  let mockRunRepo: IAgentRunRepository;
  let mockGitPrService: IGitPrService;

  beforeEach(() => {
    mockFeatureRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(createMockFeature()),
      findByIdPrefix: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      list: vi.fn(),
      findByParentId: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
    };

    mockWorktreeService = {
      create: vi.fn(),
      addExisting: vi.fn(),
      remove: vi.fn(),
      prune: vi.fn(),
      list: vi.fn(),
      exists: vi.fn(),
      branchExists: vi.fn(),
      remoteBranchExists: vi.fn().mockResolvedValue(false),
      getWorktreePath: vi.fn().mockReturnValue('/repo/.worktrees/feat-test-feature'),
      ensureGitRepository: vi.fn(),
      listBranches: vi.fn().mockResolvedValue([]),
    };

    mockProcessService = {
      spawn: vi.fn(),
      isAlive: vi.fn(),
      checkAndMarkCrashed: vi.fn(),
    };

    mockRunRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      findByThreadId: vi.fn(),
      updateStatus: vi.fn(),
      updatePinnedConfig: vi.fn(),
      findRunningByPid: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    };

    mockGitPrService = {
      getDefaultBranch: vi.fn().mockResolvedValue('main'),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
      getRemoteUrl: vi.fn().mockResolvedValue(null),
      getOpenPrForBranch: vi.fn().mockResolvedValue(null),
      getPrChecks: vi.fn().mockResolvedValue([]),
      mergePr: vi.fn(),
      createPr: vi.fn(),
      getPrDiff: vi.fn(),
      getPrComments: vi.fn().mockResolvedValue([]),
      getMergeableStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as IGitPrService;

    useCase = new DeleteFeatureUseCase(
      mockFeatureRepo,
      mockWorktreeService,
      mockProcessService,
      mockRunRepo,
      mockGitPrService
    );
  });

  it('should delete a feature successfully with no agent run', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.id).toBe('feat-123-full-uuid');
    expect(mockWorktreeService.remove).toHaveBeenCalled();
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
  });

  it('should remove worktree directly when cleanup=false', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid', { cleanup: false });

    expect(result.id).toBe('feat-123-full-uuid');
    expect(mockWorktreeService.getWorktreePath).toHaveBeenCalledWith('/repo', 'feat/test-feature');
    expect(mockWorktreeService.remove).toHaveBeenCalledWith(
      '/repo',
      '/repo/.worktrees/feat-test-feature',
      true
    );
    expect(mockGitPrService.deleteBranch).not.toHaveBeenCalled();
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
  });

  it('should cancel a running agent run before deletion', async () => {
    const feature = createMockFeature({ agentRunId: 'run-1' });
    const run = createMockAgentRun({ status: AgentRunStatus.running });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockRunRepo.findById = vi.fn().mockResolvedValue(run);

    await useCase.execute('feat-123-full-uuid');

    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith('run-1', AgentRunStatus.cancelled);
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
  });

  it('should kill the OS process if running agent has a live PID', async () => {
    const feature = createMockFeature({ agentRunId: 'run-1' });
    const run = createMockAgentRun({ status: AgentRunStatus.running, pid: 12345 });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockRunRepo.findById = vi.fn().mockResolvedValue(run);
    mockProcessService.isAlive = vi.fn().mockReturnValue(true);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    await useCase.execute('feat-123-full-uuid');

    expect(mockProcessService.isAlive).toHaveBeenCalledWith(12345);
    expect(killSpy).toHaveBeenCalledWith(12345);
    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith('run-1', AgentRunStatus.cancelled);
    killSpy.mockRestore();
  });

  it('should cancel a pending agent run before deletion', async () => {
    const feature = createMockFeature({ agentRunId: 'run-1' });
    const run = createMockAgentRun({ status: AgentRunStatus.pending });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockRunRepo.findById = vi.fn().mockResolvedValue(run);

    await useCase.execute('feat-123-full-uuid');

    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith('run-1', AgentRunStatus.cancelled);
  });

  it('should NOT cancel a completed agent run', async () => {
    const feature = createMockFeature({ agentRunId: 'run-1' });
    const run = createMockAgentRun({ status: AgentRunStatus.completed });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockRunRepo.findById = vi.fn().mockResolvedValue(run);

    await useCase.execute('feat-123-full-uuid');

    expect(mockRunRepo.updateStatus).not.toHaveBeenCalled();
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
  });

  it('should throw if feature is not found', async () => {
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);
    mockFeatureRepo.findByIdPrefix = vi.fn().mockResolvedValue(null);

    await expect(useCase.execute('non-existent')).rejects.toThrow(/not found/i);
  });

  it('should include the feature id in the error message', async () => {
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);
    mockFeatureRepo.findByIdPrefix = vi.fn().mockResolvedValue(null);

    await expect(useCase.execute('abc-123')).rejects.toThrow('abc-123');
  });

  it('should still delete feature if worktree removal fails (cleanup=false)', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockWorktreeService.remove = vi.fn().mockRejectedValue(new Error('worktree not found'));

    const result = await useCase.execute('feat-123-full-uuid', { cleanup: false });

    expect(result.id).toBe('feat-123-full-uuid');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
  });

  it('should find feature by prefix match', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);
    mockFeatureRepo.findByIdPrefix = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123');

    expect(result.id).toBe('feat-123-full-uuid');
    expect(mockFeatureRepo.findByIdPrefix).toHaveBeenCalledWith('feat-123');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
  });

  it('should return the deleted feature', async () => {
    const feature = createMockFeature({ name: 'My Feature' });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.name).toBe('My Feature');
    expect(result.branch).toBe('feat/test-feature');
  });

  // -------------------------------------------------------------------------
  // Cascade delete — sub-features
  // -------------------------------------------------------------------------

  it('should cascade delete blocked children when cascadeDelete=true', async () => {
    const feature = createMockFeature();
    const blockedChild1 = createMockFeature({
      id: 'child-001',
      name: 'Child One',
      lifecycle: SdlcLifecycle.Blocked,
      repositoryPath: '/repo',
      branch: 'feat/child-one',
    });
    const blockedChild2 = createMockFeature({
      id: 'child-002',
      name: 'Child Two',
      lifecycle: SdlcLifecycle.Blocked,
      repositoryPath: '/repo',
      branch: 'feat/child-two',
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    // findByParentId is called twice per parent: once for soft-delete, once for cleanup
    mockFeatureRepo.findByParentId = vi.fn().mockImplementation(async (parentId: string) => {
      if (parentId === 'feat-123-full-uuid') return [blockedChild1, blockedChild2];
      return [];
    });

    const result = await useCase.execute('feat-123-full-uuid', { cascadeDelete: true });

    expect(result.id).toBe('feat-123-full-uuid');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('child-001');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('child-002');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
  });

  it('should cascade delete children in any lifecycle state when cascadeDelete=true', async () => {
    const feature = createMockFeature();
    const startedChild = createMockFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Started,
      repositoryPath: '/repo',
      branch: 'feat/child-started',
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockImplementation(async (parentId: string) => {
      if (parentId === 'feat-123-full-uuid') return [startedChild];
      return [];
    });

    const result = await useCase.execute('feat-123-full-uuid', { cascadeDelete: true });

    expect(result.id).toBe('feat-123-full-uuid');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('child-001');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
  });

  it('should recursively delete grandchildren when cascadeDelete=true', async () => {
    const feature = createMockFeature();
    const child = createMockFeature({
      id: 'child-001',
      name: 'Child',
      lifecycle: SdlcLifecycle.Blocked,
      repositoryPath: '/repo',
      branch: 'feat/child',
    });
    const grandchild = createMockFeature({
      id: 'grandchild-001',
      name: 'Grandchild',
      lifecycle: SdlcLifecycle.Blocked,
      repositoryPath: '/repo',
      branch: 'feat/grandchild',
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockImplementation(async (parentId: string) => {
      if (parentId === 'feat-123-full-uuid') return [child];
      if (parentId === 'child-001') return [grandchild];
      return [];
    });

    const result = await useCase.execute('feat-123-full-uuid', { cascadeDelete: true });

    expect(result.id).toBe('feat-123-full-uuid');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('grandchild-001');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('child-001');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
  });

  it('should cancel agent runs on children during cascade delete', async () => {
    const feature = createMockFeature();
    const child = createMockFeature({
      id: 'child-001',
      agentRunId: 'child-run-1',
      lifecycle: SdlcLifecycle.Started,
      repositoryPath: '/repo',
      branch: 'feat/child',
    });
    const childRun = createMockAgentRun({ id: 'child-run-1', status: AgentRunStatus.running });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockImplementation(async (parentId: string) => {
      if (parentId === 'feat-123-full-uuid') return [child];
      return [];
    });
    mockRunRepo.findById = vi.fn().mockResolvedValue(childRun);

    await useCase.execute('feat-123-full-uuid', { cascadeDelete: true });

    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith('child-run-1', AgentRunStatus.cancelled);
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('child-001');
  });

  it('should relocate children one level up when cascadeDelete=false', async () => {
    const feature = createMockFeature({ parentId: 'repo-parent-id' });
    const child = createMockFeature({
      id: 'child-001',
      name: 'Child One',
      lifecycle: SdlcLifecycle.Blocked,
      repositoryPath: '/repo',
      branch: 'feat/child-one',
      parentId: 'feat-123-full-uuid',
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockImplementation(async (parentId: string) => {
      if (parentId === 'feat-123-full-uuid') return [child];
      return [];
    });

    const result = await useCase.execute('feat-123-full-uuid', { cascadeDelete: false });

    expect(result.id).toBe('feat-123-full-uuid');
    // Parent should be soft-deleted
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
    // Child should NOT be soft-deleted
    expect(mockFeatureRepo.softDelete).not.toHaveBeenCalledWith('child-001');
    // Child should be relocated to parent's parent
    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-001',
        parentId: 'repo-parent-id',
      })
    );
  });

  it('should cascade delete children when cascadeDelete=true', async () => {
    const feature = createMockFeature();
    const child = createMockFeature({
      id: 'child-001',
      name: 'Child One',
      lifecycle: SdlcLifecycle.Blocked,
      repositoryPath: '/repo',
      branch: 'feat/child-one',
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockImplementation(async (parentId: string) => {
      if (parentId === 'feat-123-full-uuid') return [child];
      return [];
    });

    const result = await useCase.execute('feat-123-full-uuid', { cascadeDelete: true });

    expect(result.id).toBe('feat-123-full-uuid');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('child-001');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
  });

  it('should default to cascadeDelete=false and relocate children when no options provided', async () => {
    const feature = createMockFeature();
    const child = createMockFeature({
      id: 'child-001',
      name: 'Child One',
      lifecycle: SdlcLifecycle.Blocked,
      repositoryPath: '/repo',
      branch: 'feat/child-one',
      parentId: 'feat-123-full-uuid',
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockImplementation(async (parentId: string) => {
      if (parentId === 'feat-123-full-uuid') return [child];
      return [];
    });

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.id).toBe('feat-123-full-uuid');
    // Parent should be soft-deleted
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
    // Child should NOT be soft-deleted — it's relocated instead
    expect(mockFeatureRepo.softDelete).not.toHaveBeenCalledWith('child-001');
    // Child should be relocated (parentId set to parent's parentId, which is undefined)
    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-001',
        parentId: undefined,
      })
    );
  });

  it('should relocate children and NOT cleanup them when cascadeDelete=false', async () => {
    const feature = createMockFeature();
    const child = createMockFeature({
      id: 'child-001',
      name: 'Child One',
      agentRunId: 'child-run-1',
      lifecycle: SdlcLifecycle.Started,
      repositoryPath: '/repo',
      branch: 'feat/child-one',
      parentId: 'feat-123-full-uuid',
    });
    const childRun = createMockAgentRun({ id: 'child-run-1', status: AgentRunStatus.running });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockImplementation(async (parentId: string) => {
      if (parentId === 'feat-123-full-uuid') return [child];
      return [];
    });
    mockRunRepo.findById = vi.fn().mockResolvedValue(childRun);

    await useCase.execute('feat-123-full-uuid', { cascadeDelete: false });

    // Should NOT cancel child agent runs when not cascading
    expect(mockRunRepo.updateStatus).not.toHaveBeenCalledWith(
      'child-run-1',
      AgentRunStatus.cancelled
    );
    // Parent should still be cleaned up
    expect(mockWorktreeService.remove).toHaveBeenCalledTimes(1);
    // Child should be relocated to parent's parent (undefined)
    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-001',
        parentId: undefined,
      })
    );
  });

  it('should succeed when there are no children at all', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([]);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.id).toBe('feat-123-full-uuid');
    expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
  });

  // -------------------------------------------------------------------------
  // Cleanup option (FR-12 through FR-16)
  // -------------------------------------------------------------------------

  describe('cleanup option', () => {
    it('should delete local and remote branches when cleanup=true', async () => {
      const feature = createMockFeature();
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);

      await useCase.execute('feat-123-full-uuid', { cleanup: true });

      expect(mockWorktreeService.remove).toHaveBeenCalled();
      // Single deleteBranch call with deleteRemote=true handles both local and remote
      expect(mockGitPrService.deleteBranch).toHaveBeenCalledTimes(1);
      expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith(
        '/repo',
        'feat/test-feature',
        true
      );
      expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
    });

    it('should NOT delete branches when cleanup=false', async () => {
      const feature = createMockFeature();
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

      await useCase.execute('feat-123-full-uuid', { cleanup: false });

      expect(mockGitPrService.deleteBranch).not.toHaveBeenCalled();
      expect(mockWorktreeService.remove).toHaveBeenCalled();
      expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
    });

    it('should default to cleanup=true when no options provided', async () => {
      const feature = createMockFeature();
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

      await useCase.execute('feat-123-full-uuid');

      expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith('/repo', 'feat/test-feature');
    });

    it('should still delete feature record even if branch cleanup fails', async () => {
      const feature = createMockFeature();
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      (mockGitPrService.deleteBranch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('branch not found')
      );

      await useCase.execute('feat-123-full-uuid', { cleanup: true });

      expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
    });

    it('should skip remote branch delete when remote does not exist', async () => {
      const feature = createMockFeature();
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(false);

      await useCase.execute('feat-123-full-uuid', { cleanup: true });

      // Only local branch delete — no remote
      expect(mockGitPrService.deleteBranch).toHaveBeenCalledTimes(1);
      expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith('/repo', 'feat/test-feature');
    });
  });

  // -------------------------------------------------------------------------
  // closePr option
  // -------------------------------------------------------------------------

  describe('closePr option', () => {
    it('should skip remote branch deletion when closePr is false', async () => {
      const feature = createMockFeature();
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);

      await useCase.execute('feat-123-full-uuid', { cleanup: true, closePr: false });

      // Local branch should still be deleted
      expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith('/repo', 'feat/test-feature');
      // Remote branch should NOT be deleted
      expect(mockGitPrService.deleteBranch).not.toHaveBeenCalledWith(
        '/repo',
        'feat/test-feature',
        true
      );
    });

    it('should still delete local branch when closePr is false', async () => {
      const feature = createMockFeature();
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

      await useCase.execute('feat-123-full-uuid', { cleanup: true, closePr: false });

      expect(mockGitPrService.deleteBranch).toHaveBeenCalledTimes(1);
      expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith('/repo', 'feat/test-feature');
    });

    it('should delete remote branch when closePr is true', async () => {
      const feature = createMockFeature();
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);

      await useCase.execute('feat-123-full-uuid', { cleanup: true, closePr: true });

      expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith(
        '/repo',
        'feat/test-feature',
        true
      );
    });

    it('should delete remote branch when closePr is undefined (default)', async () => {
      const feature = createMockFeature();
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);

      await useCase.execute('feat-123-full-uuid', { cleanup: true });

      expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith(
        '/repo',
        'feat/test-feature',
        true
      );
    });

    it('should update pr.status to Closed after remote branch deletion when pr is Open', async () => {
      const feature = createMockFeature({
        pr: { number: 42, status: PrStatus.Open, url: 'https://github.com/test/repo/pull/42' },
      });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);

      await useCase.execute('feat-123-full-uuid', { cleanup: true });

      expect(mockFeatureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'feat-123-full-uuid',
          pr: expect.objectContaining({ status: PrStatus.Closed }),
        })
      );
    });

    it('should not update pr.status when feature has no pr', async () => {
      const feature = createMockFeature();
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);

      await useCase.execute('feat-123-full-uuid', { cleanup: true });

      // update is called for lifecycle (markDeletingAndSoftDelete), but not for pr.status
      const updateCalls = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock.calls;
      const prUpdateCall = updateCalls.find(
        (call: unknown[]) => (call[0] as Feature)?.pr?.status === PrStatus.Closed
      );
      expect(prUpdateCall).toBeUndefined();
    });

    it('should not update pr.status when pr.status is Merged', async () => {
      const feature = createMockFeature({
        pr: { number: 42, status: PrStatus.Merged, url: 'https://github.com/test/repo/pull/42' },
      });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);

      await useCase.execute('feat-123-full-uuid', { cleanup: true });

      const updateCalls = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock.calls;
      const prUpdateCall = updateCalls.find(
        (call: unknown[]) => (call[0] as Feature)?.pr?.status === PrStatus.Closed
      );
      expect(prUpdateCall).toBeUndefined();
    });

    it('should not update pr.status when pr.status is already Closed', async () => {
      const feature = createMockFeature({
        pr: { number: 42, status: PrStatus.Closed, url: 'https://github.com/test/repo/pull/42' },
      });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);

      await useCase.execute('feat-123-full-uuid', { cleanup: true });

      // update is called for lifecycle, but the pr.status should not get another Closed update
      const updateCalls = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock.calls;
      const prUpdateCalls = updateCalls.filter(
        (call: unknown[]) => (call[0] as Feature)?.pr?.status === PrStatus.Closed
      );
      // The only call with pr.status=Closed should be the lifecycle update (which carries the existing pr)
      // There should be no additional pr.status update call
      expect(prUpdateCalls.length).toBeLessThanOrEqual(1);
    });

    it('should not throw when pr.status update fails', async () => {
      const feature = createMockFeature({
        pr: { number: 42, status: PrStatus.Open, url: 'https://github.com/test/repo/pull/42' },
      });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);
      // Make update fail on the pr.status update call (second update call)
      let updateCallCount = 0;
      (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        updateCallCount++;
        // The first update call is for markDeletingAndSoftDelete (lifecycle)
        // The pr.status update will be a later call
        if (updateCallCount > 1) {
          throw new Error('Database write failed');
        }
      });

      // Should not throw despite the update failure
      await expect(useCase.execute('feat-123-full-uuid', { cleanup: true })).resolves.toBeDefined();
    });

    it('should preserve deletedAt when updating pr.status after remote branch deletion', async () => {
      const feature = createMockFeature({
        pr: { number: 42, status: PrStatus.Open, url: 'https://github.com/test/repo/pull/42' },
      });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);

      await useCase.execute('feat-123-full-uuid', { cleanup: true });

      // The pr.status update call should preserve the deletedAt set by softDelete
      const updateCalls = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock.calls;
      const prUpdateCall = updateCalls.find(
        (call: unknown[]) => (call[0] as Feature)?.pr?.status === PrStatus.Closed
      );
      expect(prUpdateCall).toBeDefined();
      // deletedAt must be set (not undefined/null) to avoid un-soft-deleting the feature
      expect((prUpdateCall![0] as Feature).deletedAt).toBeDefined();
      expect((prUpdateCall![0] as Feature).deletedAt).toBeInstanceOf(Date);
    });

    it('should not update pr.status when closePr is false', async () => {
      const feature = createMockFeature({
        pr: { number: 42, status: PrStatus.Open, url: 'https://github.com/test/repo/pull/42' },
      });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);

      await useCase.execute('feat-123-full-uuid', { cleanup: true, closePr: false });

      const updateCalls = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock.calls;
      const prUpdateCall = updateCalls.find(
        (call: unknown[]) => (call[0] as Feature)?.pr?.status === PrStatus.Closed
      );
      expect(prUpdateCall).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Exploration feature deletion
  // -------------------------------------------------------------------------

  describe('exploration feature deletion', () => {
    it('should delete an exploration feature in Exploring lifecycle', async () => {
      const feature = createMockFeature({
        mode: FeatureMode.Exploration,
        lifecycle: SdlcLifecycle.Exploring,
        iterationCount: 5,
      });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

      const result = await useCase.execute('feat-123-full-uuid');

      expect(result.id).toBe('feat-123-full-uuid');
      expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
      expect(mockWorktreeService.remove).toHaveBeenCalled();
    });

    it('should transition Exploring to Deleting during deletion', async () => {
      const feature = createMockFeature({
        mode: FeatureMode.Exploration,
        lifecycle: SdlcLifecycle.Exploring,
      });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

      await useCase.execute('feat-123-full-uuid');

      expect(mockFeatureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'feat-123-full-uuid',
          lifecycle: SdlcLifecycle.Deleting,
        })
      );
    });

    it('should cancel running agent on exploration feature', async () => {
      const feature = createMockFeature({
        mode: FeatureMode.Exploration,
        lifecycle: SdlcLifecycle.Exploring,
        agentRunId: 'explore-run-1',
      });
      const run = createMockAgentRun({ id: 'explore-run-1', status: AgentRunStatus.running });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
      mockRunRepo.findById = vi.fn().mockResolvedValue(run);

      await useCase.execute('feat-123-full-uuid');

      expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
        'explore-run-1',
        AgentRunStatus.cancelled
      );
    });

    it('should still work for regular features (no regression)', async () => {
      const feature = createMockFeature({
        mode: FeatureMode.Regular,
        lifecycle: SdlcLifecycle.Implementation,
      });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

      const result = await useCase.execute('feat-123-full-uuid');

      expect(result.id).toBe('feat-123-full-uuid');
      expect(mockFeatureRepo.softDelete).toHaveBeenCalledWith('feat-123-full-uuid');
    });
  });
});
