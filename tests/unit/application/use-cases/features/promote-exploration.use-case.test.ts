/**
 * PromoteExplorationUseCase Unit Tests
 *
 * Tests for promoting an exploration feature to Regular or Fast mode:
 * mode transition, lifecycle transition, spec scaffolding, agent spawning,
 * and validation of preconditions.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn().mockReturnValue({
    agent: { type: 'claude-code' },
  }),
}));

import { PromoteExplorationUseCase } from '@/application/use-cases/features/promote/promote-exploration.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IFeatureAgentProcessService } from '@/application/ports/output/agents/feature-agent-process.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { ISpecInitializerService } from '@/application/ports/output/services/spec-initializer.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExplorationFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'explore-123',
    name: 'Explore Workspaces',
    slug: 'explore-workspaces',
    description: 'Explore workspace grouping',
    userQuery: 'Add workspace grouping for repos',
    repositoryPath: '/repo',
    branch: 'feat/explore-workspaces',
    lifecycle: SdlcLifecycle.Exploring,
    messages: [],
    relatedArtifacts: [],
    mode: FeatureMode.Exploration,
    iterationCount: 3,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    specPath: '/worktrees/explore-workspaces/specs/001-explore-workspaces',
    agentRunId: 'old-run-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('PromoteExplorationUseCase', () => {
  let useCase: PromoteExplorationUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockProcessService: IFeatureAgentProcessService;
  let mockRunRepo: IAgentRunRepository;
  let mockSpecInitializer: ISpecInitializerService;
  let mockWorktreeService: IWorktreeService;

  beforeEach(() => {
    mockFeatureRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(makeExplorationFeature()),
      findByIdPrefix: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      list: vi.fn(),
      findByParentId: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
    };

    mockProcessService = {
      spawn: vi.fn().mockReturnValue(123),
      isAlive: vi.fn().mockReturnValue(false),
      checkAndMarkCrashed: vi.fn(),
    };

    mockRunRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      findByThreadId: vi.fn(),
      updateStatus: vi.fn(),
      findRunningByPid: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    };

    mockSpecInitializer = {
      initialize: vi.fn().mockResolvedValue({
        specDir: '/worktrees/explore-workspaces/specs/001-explore-workspaces',
        featureNumber: '001',
      }),
    };

    mockWorktreeService = {
      create: vi.fn(),
      addExisting: vi.fn(),
      remove: vi.fn(),
      prune: vi.fn(),
      list: vi.fn(),
      exists: vi.fn(),
      branchExists: vi.fn(),
      remoteBranchExists: vi.fn(),
      getWorktreePath: vi.fn().mockReturnValue('/worktrees/explore-workspaces'),
      ensureGitRepository: vi.fn(),
      listBranches: vi.fn().mockResolvedValue([]),
    };

    useCase = new PromoteExplorationUseCase(
      mockFeatureRepo,
      mockProcessService,
      mockRunRepo,
      mockSpecInitializer,
      mockWorktreeService
    );
  });

  // -------------------------------------------------------------------------
  // Promote to Regular mode
  // -------------------------------------------------------------------------

  describe('promote to Regular', () => {
    it('should change mode from Exploration to Regular', async () => {
      const result = await useCase.execute({
        featureId: 'explore-123',
        targetMode: FeatureMode.Regular,
      });

      expect(result.feature.mode).toBe(FeatureMode.Regular);
    });

    it('should transition lifecycle from Exploring to Requirements', async () => {
      const result = await useCase.execute({
        featureId: 'explore-123',
        targetMode: FeatureMode.Regular,
      });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
    });

    it('should scaffold missing spec YAMLs when promoting to Regular', async () => {
      await useCase.execute({
        featureId: 'explore-123',
        targetMode: FeatureMode.Regular,
      });

      expect(mockSpecInitializer.initialize).toHaveBeenCalledWith(
        '/worktrees/explore-workspaces',
        'explore-workspaces',
        expect.any(Number),
        'Add workspace grouping for repos'
      );
    });

    it('should spawn agent with regular mode (no mode in options)', async () => {
      await useCase.execute({
        featureId: 'explore-123',
        targetMode: FeatureMode.Regular,
      });

      expect(mockProcessService.spawn).toHaveBeenCalledOnce();
      const spawnOptions = (mockProcessService.spawn as ReturnType<typeof vi.fn>).mock.calls[0][5];
      expect(spawnOptions.mode).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Promote to Fast mode
  // -------------------------------------------------------------------------

  describe('promote to Fast', () => {
    it('should change mode from Exploration to Fast', async () => {
      const result = await useCase.execute({
        featureId: 'explore-123',
        targetMode: FeatureMode.Fast,
      });

      expect(result.feature.mode).toBe(FeatureMode.Fast);
    });

    it('should transition lifecycle from Exploring to Implementation', async () => {
      const result = await useCase.execute({
        featureId: 'explore-123',
        targetMode: FeatureMode.Fast,
      });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Implementation);
    });

    it('should NOT scaffold spec YAMLs when promoting to Fast', async () => {
      await useCase.execute({
        featureId: 'explore-123',
        targetMode: FeatureMode.Fast,
      });

      expect(mockSpecInitializer.initialize).not.toHaveBeenCalled();
    });

    it('should spawn agent with fast mode', async () => {
      await useCase.execute({
        featureId: 'explore-123',
        targetMode: FeatureMode.Fast,
      });

      expect(mockProcessService.spawn).toHaveBeenCalledOnce();
      const spawnOptions = (mockProcessService.spawn as ReturnType<typeof vi.fn>).mock.calls[0][5];
      expect(spawnOptions.mode).toBe(FeatureMode.Fast);
    });
  });

  // -------------------------------------------------------------------------
  // Common behavior
  // -------------------------------------------------------------------------

  describe('common behavior', () => {
    it('should create a new agent run', async () => {
      await useCase.execute({
        featureId: 'explore-123',
        targetMode: FeatureMode.Regular,
      });

      expect(mockRunRepo.create).toHaveBeenCalledOnce();
      expect(mockRunRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'claude-code',
          agentName: 'feature-agent',
          status: 'pending',
          featureId: 'explore-123',
        })
      );
    });

    it('should update the feature with new agentRunId', async () => {
      const result = await useCase.execute({
        featureId: 'explore-123',
        targetMode: FeatureMode.Regular,
      });

      expect(result.feature.agentRunId).toBeDefined();
      expect(result.feature.agentRunId).not.toBe('old-run-id');
    });

    it('should preserve worktree and branch', async () => {
      const result = await useCase.execute({
        featureId: 'explore-123',
        targetMode: FeatureMode.Regular,
      });

      expect(result.feature.branch).toBe('feat/explore-workspaces');
      expect(result.feature.repositoryPath).toBe('/repo');
      // Should NOT call worktreeService.create (worktree already exists)
      expect(mockWorktreeService.create).not.toHaveBeenCalled();
    });

    it('should resolve feature by prefix', async () => {
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);
      mockFeatureRepo.findByIdPrefix = vi.fn().mockResolvedValue(makeExplorationFeature());

      const result = await useCase.execute({
        featureId: 'explore',
        targetMode: FeatureMode.Fast,
      });

      expect(result.feature.mode).toBe(FeatureMode.Fast);
      expect(mockFeatureRepo.findByIdPrefix).toHaveBeenCalledWith('explore');
    });
  });

  // -------------------------------------------------------------------------
  // Validation errors
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('should throw when feature is not found', async () => {
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);
      mockFeatureRepo.findByIdPrefix = vi.fn().mockResolvedValue(null);

      await expect(
        useCase.execute({ featureId: 'nonexistent', targetMode: FeatureMode.Regular })
      ).rejects.toThrow('Feature not found: nonexistent');
    });

    it('should throw when feature is not in Exploration mode', async () => {
      mockFeatureRepo.findById = vi
        .fn()
        .mockResolvedValue(makeExplorationFeature({ mode: FeatureMode.Regular }));

      await expect(
        useCase.execute({ featureId: 'explore-123', targetMode: FeatureMode.Fast })
      ).rejects.toThrow(/not in Exploration mode/);
    });

    it('should throw when feature is not in Exploring lifecycle', async () => {
      mockFeatureRepo.findById = vi
        .fn()
        .mockResolvedValue(makeExplorationFeature({ lifecycle: SdlcLifecycle.Implementation }));

      await expect(
        useCase.execute({ featureId: 'explore-123', targetMode: FeatureMode.Fast })
      ).rejects.toThrow(/not in Exploring lifecycle/);
    });

    it('should not spawn agent or update feature on validation error', async () => {
      mockFeatureRepo.findById = vi
        .fn()
        .mockResolvedValue(makeExplorationFeature({ mode: FeatureMode.Fast }));

      await expect(
        useCase.execute({ featureId: 'explore-123', targetMode: FeatureMode.Regular })
      ).rejects.toThrow();

      expect(mockFeatureRepo.update).not.toHaveBeenCalled();
      expect(mockProcessService.spawn).not.toHaveBeenCalled();
    });
  });
});
