/**
 * Integration tests for adopted branch agent execution flow.
 *
 * Validates that AdoptBranchUseCase correctly creates AgentRun records
 * and links them to Feature entities, enabling agent execution flows.
 *
 * Note: These tests validate the integration between AdoptBranchUseCase,
 * AgentRunRepository, SpecInitializerService, and the file system. Full
 * end-to-end agent execution tests are covered elsewhere.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SdlcLifecycle, AgentRunStatus } from '@/domain/generated/output.js';
import { AdoptBranchUseCase } from '@/application/use-cases/features/adopt-branch.use-case.js';
import { initializeSettings, resetSettings } from '@/infrastructure/services/settings.service.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { ISpecInitializerService } from '@/application/ports/output/services/spec-initializer.interface.js';

describe('Adopt Flow Integration Tests', () => {
  let tempDir: string;
  let repoPath: string;
  let mockFeatureRepo: IFeatureRepository;
  let mockRepositoryRepo: IRepositoryRepository;
  let mockAgentRunRepo: IAgentRunRepository;
  let mockWorktreeService: IWorktreeService;
  let mockGitPrService: IGitPrService;
  let mockSpecInitializer: ISpecInitializerService;
  let useCase: AdoptBranchUseCase;

  // Track created entities for verification
  let createdAgentRuns: any[] = [];
  let createdFeatures: any[] = [];

  beforeEach(() => {
    // Initialize settings service
    initializeSettings(createDefaultSettings());

    // Create temp directory for test files
    tempDir = mkdtempSync(join(tmpdir(), 'adopt-flow-test-'));
    repoPath = join(tempDir, 'test-repo');
    mkdirSync(repoPath, { recursive: true });

    // Reset tracking arrays
    createdAgentRuns = [];
    createdFeatures = [];

    // Create mock repositories
    mockFeatureRepo = {
      create: vi.fn().mockImplementation(async (feature) => {
        createdFeatures.push(feature);
      }),
      findById: vi.fn().mockResolvedValue(null),
      findByIdPrefix: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn().mockResolvedValue(null),
      findByBranch: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      findByParentId: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
    };

    mockRepositoryRepo = {
      create: vi.fn().mockResolvedValue({
        id: 'repo-123',
        name: 'test-repo',
        path: repoPath,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findById: vi.fn().mockResolvedValue(null),
      findByPath: vi.fn().mockResolvedValue({
        id: 'repo-123',
        name: 'test-repo',
        path: repoPath,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findByPathIncludingDeleted: vi.fn().mockResolvedValue(null),
      findByRemoteUrl: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    mockAgentRunRepo = {
      create: vi.fn().mockImplementation(async (agentRun) => {
        createdAgentRuns.push(agentRun);
      }),
      findById: vi.fn().mockImplementation(async (id) => {
        return createdAgentRuns.find((run) => run.id === id) ?? null;
      }),
      findByThreadId: vi.fn().mockResolvedValue(null),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      findRunningByPid: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockWorktreeService = {
      create: vi.fn(),
      addExisting: vi.fn().mockResolvedValue({
        path: join(repoPath, '.worktrees', 'test'),
        head: 'abc123',
        branch: 'test',
        isMain: false,
      }),
      remove: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(false),
      branchExists: vi.fn().mockResolvedValue(true),
      remoteBranchExists: vi.fn().mockResolvedValue(false),
      getWorktreePath: vi.fn().mockImplementation((path, slug) => join(path, '.worktrees', slug)),
      prune: vi.fn(),
      ensureGitRepository: vi.fn(),
      listBranches: vi.fn().mockResolvedValue([]),
    };

    mockGitPrService = {
      hasRemote: vi.fn().mockResolvedValue(false),
      listPrStatuses: vi.fn().mockResolvedValue([]),
      getRemoteUrl: vi.fn().mockResolvedValue(null),
      getDefaultBranch: vi.fn().mockResolvedValue('main'),
      revParse: vi.fn().mockResolvedValue('abc123'),
      hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      commitAll: vi.fn().mockResolvedValue('abc123'),
      push: vi.fn(),
      createPr: vi.fn().mockResolvedValue({ url: '', number: 0 }),
      mergePr: vi.fn(),
      mergeBranch: vi.fn(),
      getCiStatus: vi.fn().mockResolvedValue({ status: 'success' as const }),
      watchCi: vi.fn().mockResolvedValue({ status: 'success' as const }),
      deleteBranch: vi.fn(),
      getPrDiffSummary: vi
        .fn()
        .mockResolvedValue({ filesChanged: 0, additions: 0, deletions: 0, commitCount: 0 }),
      getFileDiffs: vi.fn().mockResolvedValue([]),
      verifyMerge: vi.fn().mockResolvedValue(false),
      localMergeSquash: vi.fn(),
      getMergeableStatus: vi.fn().mockResolvedValue(undefined),
      getFailureLogs: vi.fn().mockResolvedValue(''),
    };

    mockSpecInitializer = {
      initialize: vi.fn().mockImplementation(async (worktreePath, slug, featureNumber) => {
        const nnn = String(featureNumber).padStart(3, '0');
        const specDir = join(worktreePath, 'specs', `${nnn}-${slug}`);
        // Actually create the directory for filesystem tests
        mkdirSync(specDir, { recursive: true });
        writeFileSync(join(specDir, 'spec.yaml'), 'name: test\n');
        return { specDir, featureNumber: nnn };
      }),
    };

    useCase = new AdoptBranchUseCase(
      mockFeatureRepo,
      mockRepositoryRepo,
      mockWorktreeService,
      mockGitPrService,
      mockAgentRunRepo,
      mockSpecInitializer
    );
  });

  afterEach(() => {
    // Reset settings service
    resetSettings();

    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('adopt → verify agentRunId flow', () => {
    it('should create AgentRun and link to Feature when adopting branch with no existing spec', async () => {
      const result = await useCase.execute({
        branchName: 'fix/login-bug',
        repositoryPath: repoPath,
      });

      // Verify Feature was created
      expect(result.feature).toBeDefined();
      expect(result.feature.branch).toBe('fix/login-bug');
      expect(result.feature.agentRunId).toBeDefined();
      expect(result.feature.specPath).toBeDefined();

      // Verify AgentRun was created
      expect(createdAgentRuns.length).toBe(1);
      const agentRun = createdAgentRuns[0];
      expect(agentRun.featureId).toBe(result.feature.id);
      expect(agentRun.status).toBe(AgentRunStatus.pending);
      expect(agentRun.prompt).toBe('(adopted from existing branch)');
      expect(agentRun.threadId).toBeDefined();
      expect(agentRun.repositoryPath).toBe(repoPath);

      // Verify spec directory was created
      expect(existsSync(result.feature.specPath!)).toBe(true);
      expect(existsSync(join(result.feature.specPath!, 'spec.yaml'))).toBe(true);

      // Verify linkage
      expect(result.feature.agentRunId).toBe(agentRun.id);
    });

    it('should preserve existing spec directory when adopting branch with existing spec', async () => {
      // Create existing spec directory before adoption
      const worktreePath = join(repoPath, '.worktrees', 'fix-auth-bug');
      const existingSpecDir = join(worktreePath, 'specs', '000-fix-auth-bug');
      mkdirSync(existingSpecDir, { recursive: true });

      // Write a custom spec file to verify it's preserved
      const customSpecContent = 'name: custom-spec\ncontent: existing work\n';
      writeFileSync(join(existingSpecDir, 'spec.yaml'), customSpecContent);

      const result = await useCase.execute({
        branchName: 'fix/auth-bug',
        repositoryPath: repoPath,
      });

      // Verify Feature was created
      expect(result.feature).toBeDefined();
      expect(result.feature.branch).toBe('fix/auth-bug');
      expect(result.feature.agentRunId).toBeDefined();
      expect(result.feature.specPath).toBe(existingSpecDir);

      // Verify spec directory was NOT overwritten
      expect(mockSpecInitializer.initialize).not.toHaveBeenCalled();

      // Verify custom spec content is preserved
      const { readFileSync } = await import('node:fs');
      const specContent = readFileSync(join(existingSpecDir, 'spec.yaml'), 'utf-8');
      expect(specContent).toBe(customSpecContent);

      // Verify AgentRun was still created
      expect(createdAgentRuns.length).toBe(1);
      expect(createdAgentRuns[0].featureId).toBe(result.feature.id);
    });

    it('should set correct lifecycle and create AgentRun regardless of PR status', async () => {
      const result = await useCase.execute({
        branchName: 'feature/new-dashboard',
        repositoryPath: repoPath,
      });

      // No PR exists, so lifecycle should be Maintain
      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Maintain);
      expect(result.feature.openPr).toBe(false);
      expect(result.feature.pr).toBeUndefined();

      // But AgentRun should still be created
      expect(result.feature.agentRunId).toBeDefined();
      expect(createdAgentRuns.length).toBe(1);
      expect(createdAgentRuns[0].status).toBe(AgentRunStatus.pending);
    });

    it('should create AgentRun with correct feature number for multiple features', async () => {
      // Mock existing features for feature number calculation
      vi.mocked(mockFeatureRepo.list).mockResolvedValue([{ id: '1', name: 'Feature 1' } as any]);

      const result = await useCase.execute({
        branchName: 'feat/feature-2',
        repositoryPath: repoPath,
      });

      // Verify spec initializer was called with featureNumber = 1 (length of existing features)
      expect(mockSpecInitializer.initialize).toHaveBeenCalledWith(
        expect.any(String),
        'feat-feature-2',
        1, // featureNumber from existing features count
        '(adopted from existing branch)'
      );

      // Verify AgentRun exists
      expect(createdAgentRuns.length).toBe(1);
      expect(createdAgentRuns[0].featureId).toBe(result.feature.id);
    });
  });

  describe('persistence order validation', () => {
    it('should create AgentRun before Feature to respect foreign key dependency', async () => {
      await useCase.execute({
        branchName: 'fix/persistence-test',
        repositoryPath: repoPath,
      });

      // Verify both records were created
      expect(createdAgentRuns.length).toBe(1);
      expect(createdFeatures.length).toBe(1);

      const agentRun = createdAgentRuns[0];
      const feature = createdFeatures[0];

      // Verify linkage is correct
      expect(feature.agentRunId).toBe(agentRun.id);
      expect(agentRun.featureId).toBe(feature.id);

      // Verify order: AgentRun created before Feature
      // This is validated by checking that mockAgentRunRepo.create was called before mockFeatureRepo.create
      const agentRunCreateCall = vi.mocked(mockAgentRunRepo.create).mock.invocationCallOrder[0];
      const featureCreateCall = vi.mocked(mockFeatureRepo.create).mock.invocationCallOrder[0];
      expect(agentRunCreateCall).toBeLessThan(featureCreateCall);
    });
  });

  describe('error scenarios', () => {
    it('should propagate error when spec initialization fails', async () => {
      vi.mocked(mockSpecInitializer.initialize).mockRejectedValue(
        new Error('Failed to create spec directory')
      );

      await expect(
        useCase.execute({
          branchName: 'fix/error-test',
          repositoryPath: repoPath,
        })
      ).rejects.toThrow('Failed to create spec directory');

      // Verify no AgentRun or Feature was created
      expect(createdAgentRuns.length).toBe(0);
      expect(createdFeatures.length).toBe(0);
    });

    it('should propagate error when AgentRun creation fails', async () => {
      vi.mocked(mockAgentRunRepo.create).mockRejectedValue(new Error('Database connection failed'));

      await expect(
        useCase.execute({
          branchName: 'fix/error-test',
          repositoryPath: repoPath,
        })
      ).rejects.toThrow('Database connection failed');

      // Verify spec was initialized (happens before AgentRun creation)
      expect(mockSpecInitializer.initialize).toHaveBeenCalled();

      // Verify Feature was not created
      expect(createdFeatures.length).toBe(0);
    });
  });
});
