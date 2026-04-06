/**
 * CreateFeatureUseCase Unit Tests
 *
 * Tests for creating a new feature with optional parentId support:
 * parent validation, two-gate lifecycle blocking, cascade blocking,
 * deferred agent spawn, and O(depth) cycle detection.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSettings } = vi.hoisted(() => ({
  mockGetSettings: vi.fn().mockReturnValue({
    agent: { type: 'claude-code' },
    workflow: {},
  }),
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
}));

import { CreateFeatureUseCase } from '@/application/use-cases/features/create/create-feature.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { IFeatureAgentProcessService } from '@/application/ports/output/agents/feature-agent-process.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { ISpecInitializerService } from '@/application/ports/output/services/spec-initializer.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IAgentValidator } from '@/application/ports/output/agents/agent-validator.interface.js';
import type { ISkillInjectorService } from '@/application/ports/output/services/skill-injector.interface.js';
import { SdlcLifecycle, SkillSourceType } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';
import type { MetadataGenerator } from '@/application/use-cases/features/create/metadata-generator.js';
import type { SlugResolver } from '@/application/use-cases/features/create/slug-resolver.js';
import type { CreateFeatureInput } from '@/application/use-cases/features/create/types.js';
import type { Repository } from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testRepository: Repository = {
  id: 'test-repo-id',
  name: 'repo',
  path: '/repo',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeParentFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'parent-id',
    name: 'Parent Feature',
    slug: 'parent-feature',
    description: 'The parent feature',
    userQuery: 'parent query',
    repositoryPath: '/repo',
    branch: 'feat/parent-feature',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    relatedArtifacts: [],
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CreateFeatureUseCase', () => {
  let useCase: CreateFeatureUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockWorktreeService: IWorktreeService;
  let mockAgentProcess: IFeatureAgentProcessService;
  let mockRunRepo: IAgentRunRepository;
  let mockSpecInitializer: ISpecInitializerService;
  let mockMetadataGenerator: MetadataGenerator;
  let mockSlugResolver: SlugResolver;
  let mockRepositoryRepo: IRepositoryRepository;
  let mockGitPrService: IGitPrService;
  let mockAgentValidator: IAgentValidator;
  let mockSkillInjector: ISkillInjectorService;

  const baseInput: CreateFeatureInput = {
    userInput: 'Add authentication',
    repositoryPath: '/repo',
  };

  beforeEach(() => {
    mockFeatureRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      findByIdPrefix: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn().mockResolvedValue(null),
      findByBranch: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      findByParentId: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn(),
    };

    mockWorktreeService = {
      create: vi.fn().mockResolvedValue(undefined),
      addExisting: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(false),
      branchExists: vi.fn().mockResolvedValue(false),
      remoteBranchExists: vi.fn().mockResolvedValue(false),
      getWorktreePath: vi.fn().mockReturnValue('/worktrees/test-feature'),
      ensureGitRepository: vi.fn().mockResolvedValue(undefined),
      listBranches: vi.fn().mockResolvedValue([]),
    };

    mockAgentProcess = {
      spawn: vi.fn().mockReturnValue(123),
      isAlive: vi.fn().mockReturnValue(false),
      checkAndMarkCrashed: vi.fn().mockResolvedValue(undefined),
    };

    mockRunRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      findByThreadId: vi.fn().mockResolvedValue(null),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updatePinnedConfig: vi.fn().mockResolvedValue(undefined),
      findRunningByPid: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockSpecInitializer = {
      initialize: vi.fn().mockResolvedValue({
        specDir: '/worktrees/test-feature/specs/001-test-feature',
        featureNumber: '001',
      }),
    };

    mockMetadataGenerator = {
      generateMetadata: vi.fn().mockResolvedValue({
        slug: 'test-feature',
        name: 'Test Feature',
        description: 'A test feature',
      }),
    } as unknown as MetadataGenerator;

    mockSlugResolver = {
      resolveUniqueSlug: vi.fn().mockResolvedValue({
        slug: 'test-feature',
        branch: 'feat/test-feature',
        warning: undefined,
      }),
    } as unknown as SlugResolver;

    mockRepositoryRepo = {
      create: vi.fn().mockResolvedValue(testRepository),
      findById: vi.fn().mockResolvedValue(null),
      findByPath: vi.fn().mockResolvedValue(null),
      findByPathIncludingDeleted: vi.fn().mockResolvedValue(null),
      findByRemoteUrl: vi.fn().mockResolvedValue(null),
      findByUpstreamUrl: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    mockGitPrService = {
      getDefaultBranch: vi.fn().mockResolvedValue('main'),
      syncMain: vi.fn().mockResolvedValue(undefined),
      createPr: vi.fn().mockResolvedValue(undefined),
      getPr: vi.fn().mockResolvedValue(null),
      getMergeableStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as IGitPrService;

    const mockAttachmentStorage = {
      store: vi.fn(),
      commit: vi.fn().mockReturnValue([]),
      delete: vi.fn(),
    };

    mockAgentValidator = {
      isAvailable: vi.fn().mockResolvedValue({ available: true, version: '1.0.0' }),
    };

    mockSkillInjector = {
      inject: vi.fn().mockResolvedValue({ injected: [], skipped: [], failed: [] }),
    };

    mockGetSettings.mockReturnValue({
      agent: { type: 'claude-code' },
      workflow: {},
    });

    useCase = new CreateFeatureUseCase(
      mockFeatureRepo,
      mockWorktreeService,
      mockAgentProcess,
      mockRunRepo,
      mockSpecInitializer,
      mockMetadataGenerator,
      mockSlugResolver,
      mockRepositoryRepo,
      mockGitPrService,
      mockAttachmentStorage as any,
      mockAgentValidator,
      mockSkillInjector
    );
  });

  // -------------------------------------------------------------------------
  // Baseline: no parentId — existing behavior is unchanged
  // -------------------------------------------------------------------------

  describe('without parentId (baseline)', () => {
    it('should create a feature and spawn the agent', async () => {
      const result = await useCase.execute(baseInput);

      expect(result.feature).toBeDefined();
      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
      expect(mockFeatureRepo.create).toHaveBeenCalledOnce();
      expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    });

    it('should persist the feature with no parentId', async () => {
      const result = await useCase.execute(baseInput);

      expect(result.feature.parentId).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // task-5: CreateFeatureInput accepts parentId field
  // -------------------------------------------------------------------------

  it('should accept parentId in the input without TypeScript errors', async () => {
    const parent = makeParentFeature({ lifecycle: SdlcLifecycle.Maintain });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

    const inputWithParent: CreateFeatureInput = {
      ...baseInput,
      parentId: 'parent-id',
    };

    // If this compiles and runs, the field exists in the type
    const result = await useCase.execute(inputWithParent);
    expect(result.feature.parentId).toBe('parent-id');
  });

  // -------------------------------------------------------------------------
  // task-6: Parent validation
  // -------------------------------------------------------------------------

  describe('with parentId — parent validation', () => {
    it('should throw when parentId references a non-existent feature', async () => {
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);

      await expect(useCase.execute({ ...baseInput, parentId: 'non-existent-id' })).rejects.toThrow(
        'Parent feature not found: non-existent-id'
      );
    });
  });

  // -------------------------------------------------------------------------
  // task-6: Two-gate lifecycle logic
  // -------------------------------------------------------------------------

  describe('with parentId — gate logic (child lifecycle)', () => {
    it('should create child in Blocked state when parent lifecycle is Blocked', async () => {
      const parent = makeParentFeature({ lifecycle: SdlcLifecycle.Blocked });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

      const result = await useCase.execute({ ...baseInput, parentId: 'parent-id' });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Blocked);
      expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
    });

    it('should create child in Blocked state when parent lifecycle is Started', async () => {
      const parent = makeParentFeature({ lifecycle: SdlcLifecycle.Started });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

      const result = await useCase.execute({ ...baseInput, parentId: 'parent-id' });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Blocked);
      expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
    });

    it('should create child in Blocked state when parent lifecycle is Planning (< Implementation)', async () => {
      const parent = makeParentFeature({ lifecycle: SdlcLifecycle.Planning });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

      const result = await useCase.execute({ ...baseInput, parentId: 'parent-id' });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Blocked);
      expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
    });

    it('should create child in Started state when parent lifecycle is Implementation', async () => {
      const parent = makeParentFeature({ lifecycle: SdlcLifecycle.Implementation });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

      const result = await useCase.execute({ ...baseInput, parentId: 'parent-id' });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Started);
      expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    });

    it('should create child in Started state when parent lifecycle is Review', async () => {
      const parent = makeParentFeature({ lifecycle: SdlcLifecycle.Review });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

      const result = await useCase.execute({ ...baseInput, parentId: 'parent-id' });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Started);
      expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    });

    it('should create child in Started state when parent lifecycle is Maintain', async () => {
      const parent = makeParentFeature({ lifecycle: SdlcLifecycle.Maintain });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

      const result = await useCase.execute({ ...baseInput, parentId: 'parent-id' });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Started);
      expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // task-6: parentId persisted on the created feature
  // -------------------------------------------------------------------------

  describe('with parentId — persistence', () => {
    it('should persist parentId on the created feature', async () => {
      const parent = makeParentFeature({ lifecycle: SdlcLifecycle.Implementation });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

      const result = await useCase.execute({ ...baseInput, parentId: 'parent-id' });

      expect(result.feature.parentId).toBe('parent-id');
      // The feature passed to featureRepo.create should also have parentId
      const savedFeature = (mockFeatureRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedFeature.parentId).toBe('parent-id');
    });
  });

  // -------------------------------------------------------------------------
  // Child uses parent's repositoryPath, not caller's cwd
  // -------------------------------------------------------------------------

  describe('with parentId — repositoryPath resolution', () => {
    it('should use parent repositoryPath instead of input repositoryPath', async () => {
      const parent = makeParentFeature({
        lifecycle: SdlcLifecycle.Implementation,
        repositoryPath: '/original/repo',
      });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

      const result = await useCase.execute({
        ...baseInput,
        repositoryPath: '/original/repo/wt/parent-feature', // caller is in a worktree
        parentId: 'parent-id',
      });

      // The child feature should store the parent's repo path, not the worktree path
      expect(result.feature.repositoryPath).toBe('/original/repo');

      // Worktree and slug resolution should also use the original repo path
      expect(mockWorktreeService.ensureGitRepository).toHaveBeenCalledWith('/original/repo');
      expect(mockSlugResolver.resolveUniqueSlug).toHaveBeenCalledWith(
        expect.any(String),
        '/original/repo'
      );
      expect(mockGitPrService.getDefaultBranch).toHaveBeenCalledWith('/original/repo');
      expect(mockWorktreeService.getWorktreePath).toHaveBeenCalledWith(
        '/original/repo',
        expect.any(String)
      );
    });

    it('should use input repositoryPath when no parentId is given', async () => {
      const result = await useCase.execute({
        ...baseInput,
        repositoryPath: '/my/repo',
      });

      expect(result.feature.repositoryPath).toBe('/my/repo');
      expect(mockWorktreeService.ensureGitRepository).toHaveBeenCalledWith('/my/repo');
    });
  });

  // -------------------------------------------------------------------------
  // task-7: Cycle detection
  // -------------------------------------------------------------------------

  describe('cycle detection', () => {
    it('should reject a self-reference (A → A)', async () => {
      // Feature tries to set itself as its own parent
      // We need to simulate the use case where the new feature would have
      // its own ID as parentId. We can do this by giving the parent the same
      // ID that will be used as the new feature ID.
      //
      // Since the new feature ID is randomUUID() we can't predict it.
      // Instead we test via a chain: parent.parentId = <same as proposed new feature id>
      // is not testable without controlling UUID generation.
      //
      // Instead, we test a case where the parent's ancestor chain includes
      // a cycle: parent.parentId references a grandparent, and so on.
      //
      // For the self-reference case, we create a parent whose parentId loops back:
      // parent.id = "parent-id", parent.parentId = "parent-id" (self-loop)
      const selfLoopParent = makeParentFeature({
        id: 'parent-id',
        parentId: 'parent-id',
        lifecycle: SdlcLifecycle.Implementation,
      });
      mockFeatureRepo.findById = vi.fn().mockImplementation((id: string) => {
        if (id === 'parent-id') return Promise.resolve(selfLoopParent);
        return Promise.resolve(null);
      });

      await expect(useCase.execute({ ...baseInput, parentId: 'parent-id' })).rejects.toThrow(
        /[Cc]ycle/
      );
    });

    it('should reject a two-node cycle (A.parentId → B, B.parentId → A)', async () => {
      // parent A has parentId = B, B has parentId = A
      const featureA = makeParentFeature({
        id: 'feature-a',
        parentId: 'feature-b',
        lifecycle: SdlcLifecycle.Implementation,
      });
      const featureB = makeParentFeature({
        id: 'feature-b',
        parentId: 'feature-a',
        lifecycle: SdlcLifecycle.Implementation,
      });
      mockFeatureRepo.findById = vi.fn().mockImplementation((id: string) => {
        if (id === 'feature-a') return Promise.resolve(featureA);
        if (id === 'feature-b') return Promise.resolve(featureB);
        return Promise.resolve(null);
      });

      // New feature tries to become a child of A — but A → B → A is a cycle
      // that the new feature would be inserted into
      await expect(useCase.execute({ ...baseInput, parentId: 'feature-a' })).rejects.toThrow(
        /[Cc]ycle/
      );
    });

    it('should reject a deep cycle (A → B → C → D → A)', async () => {
      const featureA = makeParentFeature({
        id: 'a',
        parentId: 'b',
        lifecycle: SdlcLifecycle.Implementation,
      });
      const featureB = makeParentFeature({
        id: 'b',
        parentId: 'c',
        lifecycle: SdlcLifecycle.Implementation,
      });
      const featureC = makeParentFeature({
        id: 'c',
        parentId: 'd',
        lifecycle: SdlcLifecycle.Implementation,
      });
      const featureD = makeParentFeature({
        id: 'd',
        parentId: 'a',
        lifecycle: SdlcLifecycle.Implementation,
      });

      mockFeatureRepo.findById = vi.fn().mockImplementation((id: string) => {
        const map: Record<string, Feature> = { a: featureA, b: featureB, c: featureC, d: featureD };
        return Promise.resolve(map[id] ?? null);
      });

      await expect(useCase.execute({ ...baseInput, parentId: 'a' })).rejects.toThrow(/[Cc]ycle/);
    });

    it('should allow a valid deep chain without cycles (A → B → C)', async () => {
      // C is the root (no parentId), B is a child of C, A is a child of B
      // New feature becomes a child of A — valid, no cycle
      const featureC = makeParentFeature({
        id: 'c',
        parentId: undefined,
        lifecycle: SdlcLifecycle.Implementation,
      });
      const featureB = makeParentFeature({
        id: 'b',
        parentId: 'c',
        lifecycle: SdlcLifecycle.Implementation,
      });
      const featureA = makeParentFeature({
        id: 'a',
        parentId: 'b',
        lifecycle: SdlcLifecycle.Implementation,
      });

      mockFeatureRepo.findById = vi.fn().mockImplementation((id: string) => {
        const map: Record<string, Feature> = { a: featureA, b: featureB, c: featureC };
        return Promise.resolve(map[id] ?? null);
      });

      const result = await useCase.execute({ ...baseInput, parentId: 'a' });
      expect(result.feature).toBeDefined();
      expect(result.feature.parentId).toBe('a');
    });
  });

  // -------------------------------------------------------------------------
  // Repository creation guard
  // -------------------------------------------------------------------------

  describe('repository creation guard', () => {
    it('throws if repositoryRepo.create() returns falsy', async () => {
      mockRepositoryRepo.findByPath = vi.fn().mockResolvedValue(null);
      mockRepositoryRepo.create = vi.fn().mockResolvedValue(null as any);

      await expect(useCase.execute(baseInput)).rejects.toThrow(
        'Failed to create or retrieve repository record'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Fast mode
  // -------------------------------------------------------------------------

  describe('fast mode', () => {
    it('should set lifecycle to Implementation when fast=true', async () => {
      const result = await useCase.execute({ ...baseInput, fast: true });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Implementation);
    });

    it('should set lifecycle to Requirements when fast=false', async () => {
      const result = await useCase.execute({ ...baseInput, fast: false });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
    });

    it('should set lifecycle to Requirements when fast is undefined', async () => {
      const result = await useCase.execute(baseInput);

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
    });

    it('should pass fast flag to specInitializer.initialize() as mode', async () => {
      await useCase.execute({ ...baseInput, fast: true });

      expect(mockSpecInitializer.initialize).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        'fast'
      );
    });

    it('should not pass mode to specInitializer.initialize() when fast is false', async () => {
      await useCase.execute({ ...baseInput, fast: false });

      expect(mockSpecInitializer.initialize).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        undefined
      );
    });

    it('should pass fast=true to agentProcess.spawn() options', async () => {
      await useCase.execute({ ...baseInput, fast: true });

      expect(mockAgentProcess.spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ fast: true })
      );
    });

    it('should not include fast in spawn options when fast is false', async () => {
      await useCase.execute({ ...baseInput, fast: false });

      const spawnCall = (mockAgentProcess.spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const options = spawnCall[5];
      expect(options.fast).toBeUndefined();
    });

    it('should still set lifecycle to Blocked for child feature with fast=true when parent is Blocked', async () => {
      const parent = makeParentFeature({ lifecycle: SdlcLifecycle.Blocked });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

      const result = await useCase.execute({
        ...baseInput,
        parentId: 'parent-id',
        fast: true,
      });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Blocked);
      expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Pending flag
  // -------------------------------------------------------------------------

  describe('pending flag', () => {
    it('should accept pending field in CreateFeatureInput without TypeScript errors', () => {
      const input: CreateFeatureInput = {
        userInput: 'test',
        repositoryPath: '/repo',
        pending: true,
      };
      expect(input.pending).toBe(true);
    });

    it('should create feature in Pending lifecycle when pending=true', async () => {
      const result = await useCase.execute({ ...baseInput, pending: true });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Pending);
    });

    it('should not spawn agent when pending=true', async () => {
      await useCase.execute({ ...baseInput, pending: true });

      expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
    });

    it('should create feature in Pending lifecycle when pending=true and parentId is set', async () => {
      const parent = makeParentFeature({ lifecycle: SdlcLifecycle.Requirements });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

      const result = await useCase.execute({
        ...baseInput,
        pending: true,
        parentId: 'parent-id',
      });

      // Pending takes precedence over parent gate logic
      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Pending);
      expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
    });

    it('should create feature in Pending lifecycle when pending=true, parentId set, and parent in POST_IMPLEMENTATION', async () => {
      const parent = makeParentFeature({ lifecycle: SdlcLifecycle.Implementation });
      mockFeatureRepo.findById = vi.fn().mockResolvedValue(parent);

      const result = await useCase.execute({
        ...baseInput,
        pending: true,
        parentId: 'parent-id',
      });

      // Pending takes precedence even when parent gate is satisfied
      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Pending);
      expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
    });

    it('should preserve existing behavior when pending is false', async () => {
      const result = await useCase.execute({ ...baseInput, pending: false });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
      expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    });

    it('should preserve existing behavior when pending is undefined', async () => {
      const result = await useCase.execute(baseInput);

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
      expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    });

    it('should set fast feature to Pending lifecycle when pending=true and fast=true', async () => {
      const result = await useCase.execute({ ...baseInput, pending: true, fast: true });

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Pending);
      expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // task-8: optional model field wired to spawn options
  // -------------------------------------------------------------------------

  describe('model field wiring', () => {
    it('should pass model to spawn when input.model is provided', async () => {
      const inputWithModel: CreateFeatureInput = {
        ...baseInput,
        model: 'claude-opus-4-6',
      };

      await useCase.execute(inputWithModel);

      expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
      const spawnOptions = (mockAgentProcess.spawn as ReturnType<typeof vi.fn>).mock.calls[0][5];
      expect(spawnOptions.model).toBe('claude-opus-4-6');
    });

    it('should not set model on spawn options when input.model is absent', async () => {
      await useCase.execute(baseInput);

      expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
      const spawnOptions = (mockAgentProcess.spawn as ReturnType<typeof vi.fn>).mock.calls[0][5];
      expect(spawnOptions.model).toBeUndefined();
    });

    it('should accept model field in CreateFeatureInput without TypeScript errors', () => {
      const input: CreateFeatureInput = {
        userInput: 'test',
        repositoryPath: '/repo',
        model: 'claude-sonnet-4-6',
      };
      expect(input.model).toBe('claude-sonnet-4-6');
    });
  });

  // -------------------------------------------------------------------------
  // rebaseBeforeBranch (sync main before branch creation)
  // -------------------------------------------------------------------------

  describe('rebaseBeforeBranch', () => {
    it('should sync main before creating worktree by default', async () => {
      await useCase.execute(baseInput);

      expect(mockGitPrService.syncMain).toHaveBeenCalledWith('/repo', 'main');
      // syncMain should be called before worktree.create
      const syncOrder = (mockGitPrService.syncMain as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0];
      const createOrder = (mockWorktreeService.create as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0];
      expect(syncOrder).toBeLessThan(createOrder);
    });

    it('should sync main when rebaseBeforeBranch is explicitly true', async () => {
      await useCase.execute({ ...baseInput, rebaseBeforeBranch: true });

      expect(mockGitPrService.syncMain).toHaveBeenCalledWith('/repo', 'main');
    });

    it('should skip sync when rebaseBeforeBranch is false', async () => {
      await useCase.execute({ ...baseInput, rebaseBeforeBranch: false });

      expect(mockGitPrService.syncMain).not.toHaveBeenCalled();
    });

    it('should still create worktree when syncMain fails', async () => {
      (mockGitPrService.syncMain as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('no remote')
      );

      const result = await useCase.execute(baseInput);

      expect(result.feature).toBeDefined();
      expect(mockWorktreeService.create).toHaveBeenCalled();
    });

    it('should accept rebaseBeforeBranch field in CreateFeatureInput', () => {
      const input: CreateFeatureInput = {
        userInput: 'test',
        repositoryPath: '/repo',
        rebaseBeforeBranch: false,
      };
      expect(input.rebaseBeforeBranch).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Agent validation before spawn (#355, #356)
  // -------------------------------------------------------------------------

  describe('agent validation before spawn', () => {
    it('should throw with meaningful error when agent is not available', async () => {
      mockAgentValidator.isAvailable = vi.fn().mockResolvedValue({
        available: false,
        error: 'Binary "claude" not found or not executable: ENOENT',
      });

      await expect(useCase.execute(baseInput)).rejects.toThrow(
        /Agent "claude-code" is not available/
      );
      expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
    });

    it('should mark agent run as failed when agent is not available', async () => {
      mockAgentValidator.isAvailable = vi.fn().mockResolvedValue({
        available: false,
        error: 'Binary "claude" not found',
      });

      await expect(useCase.execute(baseInput)).rejects.toThrow();
      expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        'failed',
        expect.objectContaining({
          error: expect.stringContaining('not available'),
        })
      );
    });

    it('should spawn agent when validation passes', async () => {
      mockAgentValidator.isAvailable = vi.fn().mockResolvedValue({
        available: true,
        version: '1.0.0',
      });

      const result = await useCase.execute(baseInput);
      expect(result.feature).toBeDefined();
      expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    });

    it('should validate the input agentType when provided', async () => {
      mockAgentValidator.isAvailable = vi.fn().mockResolvedValue({
        available: false,
        error: 'Agent type "gemini-cli" is not supported yet',
      });

      await expect(useCase.execute({ ...baseInput, agentType: 'gemini-cli' })).rejects.toThrow(
        /Agent "gemini-cli" is not available/
      );

      expect(mockAgentValidator.isAvailable).toHaveBeenCalledWith('gemini-cli');
    });
  });

  // -------------------------------------------------------------------------
  // Skill injection integration (task-13)
  // -------------------------------------------------------------------------

  describe('skill injection', () => {
    const skillInjectionConfig = {
      enabled: true,
      skills: [
        {
          name: 'architecture-reviewer',
          type: SkillSourceType.Local,
          source: '.claude/skills/architecture-reviewer',
        },
      ],
    };

    it('should call skillInjector.inject() when injectSkills is true', async () => {
      mockGetSettings.mockReturnValue({
        agent: { type: 'claude-code' },
        workflow: { skillInjection: skillInjectionConfig },
      });

      await useCase.execute({ ...baseInput, injectSkills: true });

      expect(mockSkillInjector.inject).toHaveBeenCalledOnce();
      expect(mockSkillInjector.inject).toHaveBeenCalledWith(
        '/worktrees/test-feature',
        skillInjectionConfig,
        '/repo'
      );
    });

    it('should NOT call inject() when injectSkills is false', async () => {
      mockGetSettings.mockReturnValue({
        agent: { type: 'claude-code' },
        workflow: { skillInjection: skillInjectionConfig },
      });

      await useCase.execute({ ...baseInput, injectSkills: false });

      expect(mockSkillInjector.inject).not.toHaveBeenCalled();
    });

    it('should NOT call inject() when skills list is empty', async () => {
      mockGetSettings.mockReturnValue({
        agent: { type: 'claude-code' },
        workflow: { skillInjection: { enabled: true, skills: [] } },
      });

      await useCase.execute({ ...baseInput, injectSkills: true });

      expect(mockSkillInjector.inject).not.toHaveBeenCalled();
    });

    it('should fall back to default skills when skillInjection config is undefined', async () => {
      mockGetSettings.mockReturnValue({
        agent: { type: 'claude-code' },
        workflow: {},
      });

      await useCase.execute({ ...baseInput, injectSkills: true });

      expect(mockSkillInjector.inject).toHaveBeenCalledOnce();
      const config = vi.mocked(mockSkillInjector.inject).mock.calls[0][1];
      expect(config.skills.length).toBeGreaterThan(0);
    });

    it('should use settings.workflow.skillInjection.enabled when injectSkills is undefined', async () => {
      mockGetSettings.mockReturnValue({
        agent: { type: 'claude-code' },
        workflow: { skillInjection: skillInjectionConfig },
      });

      await useCase.execute(baseInput);

      expect(mockSkillInjector.inject).toHaveBeenCalledOnce();
    });

    it('should NOT inject when settings.enabled is false and injectSkills is undefined', async () => {
      mockGetSettings.mockReturnValue({
        agent: { type: 'claude-code' },
        workflow: { skillInjection: { ...skillInjectionConfig, enabled: false } },
      });

      await useCase.execute(baseInput);

      expect(mockSkillInjector.inject).not.toHaveBeenCalled();
    });

    it('should override settings.enabled=false when injectSkills=true', async () => {
      mockGetSettings.mockReturnValue({
        agent: { type: 'claude-code' },
        workflow: { skillInjection: { ...skillInjectionConfig, enabled: false } },
      });

      await useCase.execute({ ...baseInput, injectSkills: true });

      expect(mockSkillInjector.inject).toHaveBeenCalledOnce();
    });

    it('should override settings.enabled=true when injectSkills=false', async () => {
      mockGetSettings.mockReturnValue({
        agent: { type: 'claude-code' },
        workflow: { skillInjection: skillInjectionConfig },
      });

      await useCase.execute({ ...baseInput, injectSkills: false });

      expect(mockSkillInjector.inject).not.toHaveBeenCalled();
    });

    it('should continue with agent spawn when inject() throws', async () => {
      mockGetSettings.mockReturnValue({
        agent: { type: 'claude-code' },
        workflow: { skillInjection: skillInjectionConfig },
      });
      (mockSkillInjector.inject as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('injection failed')
      );

      const result = await useCase.execute({ ...baseInput, injectSkills: true });

      expect(result.feature).toBeDefined();
      expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
    });

    it('should still complete feature creation when inject() throws', async () => {
      mockGetSettings.mockReturnValue({
        agent: { type: 'claude-code' },
        workflow: { skillInjection: skillInjectionConfig },
      });
      (mockSkillInjector.inject as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('injection failed')
      );

      const result = await useCase.execute({ ...baseInput, injectSkills: true });

      expect(mockFeatureRepo.update).toHaveBeenCalled();
      expect(result.feature.name).toBe('Test Feature');
    });

    it('should default injectSkills to false when both input and settings are undefined', async () => {
      mockGetSettings.mockReturnValue({
        agent: { type: 'claude-code' },
        workflow: {},
      });

      await useCase.execute(baseInput);

      expect(mockSkillInjector.inject).not.toHaveBeenCalled();
    });
  });
});
