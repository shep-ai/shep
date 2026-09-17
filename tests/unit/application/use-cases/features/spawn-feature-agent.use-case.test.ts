/**
 * SpawnFeatureAgentUseCase Unit Tests
 *
 * The single spawn path. These tests are the regression lock for the drift that
 * motivated the extraction: the auto-unblock path used to omit agentType and
 * model from its options bag, so a feature created against a non-default agent
 * silently resumed under the default one.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SpawnFeatureAgentUseCase } from '@/application/use-cases/features/spawn-feature-agent.use-case.js';
import { SdlcLifecycle, AgentRunStatus, BuildMode } from '@/domain/generated/output.js';
import type { Feature, AgentRun } from '@/domain/generated/output.js';

function createTestFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-001',
    name: 'Test feature',
    slug: 'test-feature',
    description: 'Test',
    userQuery: 'test user query',
    repositoryPath: '/test/repo',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Requirements,
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
    specPath: '/wt/feat-test/specs/001-test-feature',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createTestRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: 'run-001',
    agentType: 'gemini-cli' as AgentRun['agentType'],
    agentName: 'feature-agent',
    status: AgentRunStatus.pending,
    prompt: 'Test',
    threadId: 'thread-001',
    featureId: 'feat-001',
    repositoryPath: '/test/repo',
    modelId: 'gemini-3.1-pro',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SpawnFeatureAgentUseCase', () => {
  let useCase: SpawnFeatureAgentUseCase;
  let featureRepo: { findById: ReturnType<typeof vi.fn> };
  let runRepo: { findById: ReturnType<typeof vi.fn> };
  let processService: { spawn: ReturnType<typeof vi.fn> };
  let worktreeService: { getWorktreePath: ReturnType<typeof vi.fn> };
  let settingsRepository: { load: ReturnType<typeof vi.fn> };
  let syncFeatureBranch: { execute: ReturnType<typeof vi.fn> };

  const spawnOptions = () => processService.spawn.mock.calls[0][5];

  beforeEach(() => {
    featureRepo = { findById: vi.fn() };
    runRepo = { findById: vi.fn().mockResolvedValue(createTestRun()) };
    processService = { spawn: vi.fn().mockReturnValue(12345) };
    worktreeService = { getWorktreePath: vi.fn().mockReturnValue('/derived/wt/feat-test') };
    settingsRepository = {
      load: vi.fn().mockResolvedValue({ security: { mode: 'Advisory' } }),
    };
    syncFeatureBranch = { execute: vi.fn().mockResolvedValue({}) };

    useCase = new SpawnFeatureAgentUseCase(
      featureRepo as never,
      runRepo as never,
      processService as never,
      worktreeService as never,
      settingsRepository as never,
      syncFeatureBranch as never
    );
  });

  describe('agent identity (regression lock)', () => {
    it('carries the agent run agentType into the spawn options', async () => {
      await useCase.execute({ feature: createTestFeature() });

      expect(spawnOptions().agentType).toBe('gemini-cli');
    });

    it('carries the agent run modelId into the spawn options', async () => {
      await useCase.execute({ feature: createTestFeature() });

      expect(spawnOptions().model).toBe('gemini-3.1-pro');
    });

    it('omits model entirely when the run pinned none', async () => {
      runRepo.findById.mockResolvedValue(createTestRun({ modelId: undefined }));

      await useCase.execute({ feature: createTestFeature() });

      expect(spawnOptions()).not.toHaveProperty('model');
    });

    it('carries the agent run threadId so the conversation resumes', async () => {
      await useCase.execute({ feature: createTestFeature() });

      expect(spawnOptions().threadId).toBe('thread-001');
    });
  });

  describe('per-feature flags', () => {
    it('forwards every per-feature flag from the persisted entity', async () => {
      const feature = createTestFeature({
        push: true,
        openPr: true,
        forkAndPr: true,
        commitSpecs: false,
        ciWatchEnabled: false,
        enableEvidence: true,
        commitEvidence: true,
      });

      await useCase.execute({ feature });

      expect(spawnOptions()).toMatchObject({
        push: true,
        openPr: true,
        forkAndPr: true,
        commitSpecs: false,
        ciWatchEnabled: false,
        enableEvidence: true,
        commitEvidence: true,
        approvalGates: feature.approvalGates,
      });
    });

    it('marks fast mode from either the legacy flag or the build mode', async () => {
      await useCase.execute({ feature: createTestFeature({ fast: true }) });
      expect(spawnOptions().fast).toBe(true);

      processService.spawn.mockClear();
      await useCase.execute({ feature: createTestFeature({ buildMode: BuildMode.Fast }) });
      expect(spawnOptions().fast).toBe(true);
    });

    it('marks exploration mode from the build mode', async () => {
      await useCase.execute({ feature: createTestFeature({ buildMode: BuildMode.Exploration }) });

      expect(spawnOptions().exploration).toBe(true);
    });

    it('passes the configured security mode', async () => {
      await useCase.execute({ feature: createTestFeature() });

      expect(spawnOptions().securityMode).toBe('Advisory');
    });
  });

  describe('worktree resolution', () => {
    it('uses the stored worktree path when the feature has one', async () => {
      await useCase.execute({ feature: createTestFeature({ worktreePath: '/stored/wt' }) });

      expect(processService.spawn.mock.calls[0][4]).toBe('/stored/wt');
      expect(worktreeService.getWorktreePath).not.toHaveBeenCalled();
    });

    it('derives the worktree path when the record has none', async () => {
      await useCase.execute({ feature: createTestFeature({ worktreePath: '' }) });

      expect(processService.spawn.mock.calls[0][4]).toBe('/derived/wt/feat-test');
    });
  });

  describe('branch sync', () => {
    it('syncs onto the base branch by default', async () => {
      await useCase.execute({ feature: createTestFeature() });

      expect(syncFeatureBranch.execute).toHaveBeenCalledWith({
        repositoryPath: '/test/repo',
        branch: 'feat/test-feature',
      });
    });

    it('syncs onto the parent branch when one is given', async () => {
      await useCase.execute({ feature: createTestFeature(), parentBranch: 'feat/parent' });

      expect(syncFeatureBranch.execute).toHaveBeenCalledWith({
        repositoryPath: '/test/repo',
        branch: 'feat/test-feature',
        parentBranch: 'feat/parent',
      });
    });

    it('skips the sync when the caller already rebased', async () => {
      await useCase.execute({ feature: createTestFeature(), syncBranch: false });

      expect(syncFeatureBranch.execute).not.toHaveBeenCalled();
      expect(processService.spawn).toHaveBeenCalled();
    });

    it('still spawns when the sync fails', async () => {
      syncFeatureBranch.execute.mockRejectedValue(new Error('rebase needs a human'));

      const result = await useCase.execute({ feature: createTestFeature() });

      expect(result.spawned).toBe(true);
      expect(processService.spawn).toHaveBeenCalled();
    });
  });

  describe('defensive guards', () => {
    it('does not spawn a feature with no agent run id', async () => {
      const result = await useCase.execute({
        feature: createTestFeature({ agentRunId: undefined }),
      });

      expect(result.spawned).toBe(false);
      expect(processService.spawn).not.toHaveBeenCalled();
    });

    it('does not spawn a feature with no spec path', async () => {
      const result = await useCase.execute({ feature: createTestFeature({ specPath: undefined }) });

      expect(result.spawned).toBe(false);
      expect(processService.spawn).not.toHaveBeenCalled();
    });

    it('does not spawn when the agent run record is missing', async () => {
      runRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute({ feature: createTestFeature() });

      expect(result.spawned).toBe(false);
      expect(processService.spawn).not.toHaveBeenCalled();
    });
  });

  describe('executeById', () => {
    it('resolves the feature and spawns it', async () => {
      featureRepo.findById.mockResolvedValue(createTestFeature());

      const result = await useCase.executeById('feat-001');

      expect(result.spawned).toBe(true);
      expect(processService.spawn).toHaveBeenCalled();
    });

    it('reports not spawned for a missing feature', async () => {
      featureRepo.findById.mockResolvedValue(null);

      const result = await useCase.executeById('nope');

      expect(result.spawned).toBe(false);
      expect(processService.spawn).not.toHaveBeenCalled();
    });
  });
});
