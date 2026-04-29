/**
 * CreateFeatureFromRemoteUseCase Unit Tests
 *
 * Tests for the composite use case that chains ImportGitHubRepositoryUseCase
 * with CreateFeatureUseCase. Validates execute(), createRecord(), and
 * initializeAndSpawn() delegation patterns.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateFeatureFromRemoteUseCase } from '@/application/use-cases/features/create/create-feature-from-remote.use-case.js';
import type { ImportGitHubRepositoryUseCase } from '@/application/use-cases/repositories/import-github-repository.use-case.js';
import type { CreateFeatureUseCase } from '@/application/use-cases/features/create/create-feature.use-case.js';
import type { Repository, Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';
import type { CreateFeatureFromRemoteInput } from '@/application/use-cases/features/create/create-feature-from-remote.use-case.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRepository(overrides?: Partial<Repository>): Repository {
  return {
    id: 'repo-1',
    name: 'my-project',
    path: '/home/user/repos/my-project',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function createMockFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feature-1',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'add auth',
    repositoryPath: '/home/user/repos/my-project',
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
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

const baseInput: CreateFeatureFromRemoteInput = {
  remoteUrl: 'https://github.com/octocat/my-project',
  userInput: 'add authentication',
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CreateFeatureFromRemoteUseCase', () => {
  let useCase: CreateFeatureFromRemoteUseCase;
  let mockImportUseCase: ImportGitHubRepositoryUseCase;
  let mockCreateFeatureUseCase: CreateFeatureUseCase;
  let mockRepository: Repository;
  let mockFeature: Feature;

  beforeEach(() => {
    mockRepository = createMockRepository();
    mockFeature = createMockFeature();

    mockImportUseCase = {
      execute: vi.fn<() => Promise<Repository>>().mockResolvedValue(mockRepository),
    } as unknown as ImportGitHubRepositoryUseCase;

    mockCreateFeatureUseCase = {
      execute: vi.fn().mockResolvedValue({ feature: mockFeature, warning: undefined }),
      createRecord: vi.fn().mockResolvedValue({ feature: mockFeature, shouldSpawn: true }),
      initializeAndSpawn: vi
        .fn()
        .mockResolvedValue({ updatedFeature: mockFeature, warning: undefined }),
    } as unknown as CreateFeatureUseCase;

    useCase = new CreateFeatureFromRemoteUseCase(mockImportUseCase, mockCreateFeatureUseCase);
  });

  // ---------------------------------------------------------------------------
  // execute() — full synchronous flow
  // ---------------------------------------------------------------------------

  describe('execute()', () => {
    it('should chain import then createFeature', async () => {
      const result = await useCase.execute(baseInput);

      expect(mockImportUseCase.execute).toHaveBeenCalledOnce();
      expect(mockCreateFeatureUseCase.execute).toHaveBeenCalledOnce();
      expect(result.feature).toBe(mockFeature);
    });

    it('should pass remoteUrl as url to import use case', async () => {
      await useCase.execute(baseInput);

      expect(mockImportUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://github.com/octocat/my-project' })
      );
    });

    it('should pass cloneDest, defaultCloneDir, cloneOptions, and forkOptions to import', async () => {
      const onProgress = vi.fn();
      const onForkProgress = vi.fn();

      await useCase.execute({
        ...baseInput,
        cloneDest: '/custom/dest',
        defaultCloneDir: '/default/dir',
        cloneOptions: { onProgress },
        forkOptions: { onProgress: onForkProgress },
      });

      expect(mockImportUseCase.execute).toHaveBeenCalledWith({
        url: 'https://github.com/octocat/my-project',
        dest: '/custom/dest',
        defaultCloneDir: '/default/dir',
        cloneOptions: { onProgress },
        forkOptions: { onProgress: onForkProgress },
      });
    });

    it('should use imported repository path as repositoryPath for createFeature', async () => {
      vi.mocked(mockImportUseCase.execute).mockResolvedValue(
        createMockRepository({ path: '/cloned/repo/path' })
      );

      await useCase.execute(baseInput);

      expect(mockCreateFeatureUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ repositoryPath: '/cloned/repo/path' })
      );
    });

    it('should forward all CreateFeature input fields', async () => {
      const fullInput: CreateFeatureFromRemoteInput = {
        remoteUrl: 'https://github.com/octocat/my-project',
        userInput: 'add authentication',
        approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
        push: true,
        openPr: true,
        parentId: 'parent-123',
        name: 'Auth Feature',
        description: 'Add OAuth authentication',
        fast: true,
        pending: false,
        agentType: 'claude-code',
        model: 'claude-opus-4-6',
        attachments: [],
        sessionId: 'session-abc',
        attachmentPaths: ['/tmp/file.txt'],
      };

      await useCase.execute(fullInput);

      expect(mockCreateFeatureUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userInput: 'add authentication',
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
          push: true,
          openPr: true,
          parentId: 'parent-123',
          name: 'Auth Feature',
          description: 'Add OAuth authentication',
          fast: true,
          pending: false,
          agentType: 'claude-code',
          model: 'claude-opus-4-6',
          attachments: [],
          sessionId: 'session-abc',
          attachmentPaths: ['/tmp/file.txt'],
        })
      );
    });

    it('should propagate import errors without calling createFeature', async () => {
      vi.mocked(mockImportUseCase.execute).mockRejectedValue(new Error('Clone failed'));

      await expect(useCase.execute(baseInput)).rejects.toThrow('Clone failed');
      expect(mockCreateFeatureUseCase.execute).not.toHaveBeenCalled();
    });

    it('should propagate createFeature errors', async () => {
      vi.mocked(mockCreateFeatureUseCase.execute).mockRejectedValue(
        new Error('Feature creation failed')
      );

      await expect(useCase.execute(baseInput)).rejects.toThrow('Feature creation failed');
    });

    it('should return warning from createFeature result', async () => {
      vi.mocked(mockCreateFeatureUseCase.execute).mockResolvedValue({
        feature: mockFeature,
        warning: 'slug collision resolved',
      });

      const result = await useCase.execute(baseInput);

      expect(result.warning).toBe('slug collision resolved');
    });
  });

  // ---------------------------------------------------------------------------
  // createRecord() — fast phase 1 for Web UI
  // ---------------------------------------------------------------------------

  describe('createRecord()', () => {
    it('should chain import then createFeature.createRecord', async () => {
      const result = await useCase.createRecord(baseInput);

      expect(mockImportUseCase.execute).toHaveBeenCalledOnce();
      expect(mockCreateFeatureUseCase.createRecord).toHaveBeenCalledOnce();
      expect(result.feature).toBe(mockFeature);
      expect(result.shouldSpawn).toBe(true);
    });

    it('should pass imported repository path to createRecord', async () => {
      vi.mocked(mockImportUseCase.execute).mockResolvedValue(
        createMockRepository({ path: '/imported/path' })
      );

      await useCase.createRecord(baseInput);

      expect(mockCreateFeatureUseCase.createRecord).toHaveBeenCalledWith(
        expect.objectContaining({ repositoryPath: '/imported/path' })
      );
    });

    it('should forward all feature input fields to createRecord', async () => {
      await useCase.createRecord({
        ...baseInput,
        name: 'My Feature',
        fast: true,
        pending: true,
      });

      expect(mockCreateFeatureUseCase.createRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          userInput: 'add authentication',
          name: 'My Feature',
          fast: true,
          pending: true,
        })
      );
    });

    it('should propagate import errors in createRecord', async () => {
      vi.mocked(mockImportUseCase.execute).mockRejectedValue(new Error('Auth check failed'));

      await expect(useCase.createRecord(baseInput)).rejects.toThrow('Auth check failed');
      expect(mockCreateFeatureUseCase.createRecord).not.toHaveBeenCalled();
    });

    it('should return shouldSpawn=false when child is blocked', async () => {
      vi.mocked(mockCreateFeatureUseCase.createRecord).mockResolvedValue({
        feature: createMockFeature({ lifecycle: SdlcLifecycle.Blocked }),
        shouldSpawn: false,
      });

      const result = await useCase.createRecord(baseInput);

      expect(result.shouldSpawn).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // initializeAndSpawn() — phase 2 background work
  // ---------------------------------------------------------------------------

  describe('initializeAndSpawn()', () => {
    it('should delegate to createFeature.initializeAndSpawn', async () => {
      const feature = createMockFeature();

      await useCase.initializeAndSpawn(feature, baseInput, true);

      expect(mockCreateFeatureUseCase.initializeAndSpawn).toHaveBeenCalledOnce();
    });

    it('should pass feature, input fields, and shouldSpawn to createFeature', async () => {
      const feature = createMockFeature({
        id: 'feat-abc',
        repositoryPath: '/home/user/repos/my-project',
      });

      await useCase.initializeAndSpawn(feature, baseInput, true);

      expect(mockCreateFeatureUseCase.initializeAndSpawn).toHaveBeenCalledWith(
        feature,
        expect.objectContaining({
          userInput: 'add authentication',
          repositoryPath: '/home/user/repos/my-project',
        }),
        true
      );
    });

    it('should pass repositoryPath from feature (not an empty string)', async () => {
      const feature = createMockFeature({ repositoryPath: '/repos/my-project' });

      await useCase.initializeAndSpawn(feature, baseInput, false);

      const callArgs = vi.mocked(mockCreateFeatureUseCase.initializeAndSpawn).mock.calls[0];
      expect(callArgs[1].repositoryPath).toBe('/repos/my-project');
    });

    it('should forward shouldSpawn=false to createFeature', async () => {
      const feature = createMockFeature();

      await useCase.initializeAndSpawn(feature, baseInput, false);

      const callArgs = vi.mocked(mockCreateFeatureUseCase.initializeAndSpawn).mock.calls[0];
      expect(callArgs[2]).toBe(false);
    });

    it('should return the updated feature and warning from createFeature', async () => {
      const updatedFeature = createMockFeature({ id: 'updated-feat' });
      vi.mocked(mockCreateFeatureUseCase.initializeAndSpawn).mockResolvedValue({
        updatedFeature,
        warning: 'some warning',
      });

      const result = await useCase.initializeAndSpawn(createMockFeature(), baseInput, true);

      expect(result.updatedFeature).toBe(updatedFeature);
      expect(result.warning).toBe('some warning');
    });

    it('should forward all input fields to createFeature.initializeAndSpawn', async () => {
      const fullInput: CreateFeatureFromRemoteInput = {
        remoteUrl: 'https://github.com/octocat/my-project',
        userInput: 'add auth',
        push: true,
        openPr: true,
        fast: true,
        agentType: 'claude-code',
        model: 'claude-opus-4-6',
      };

      await useCase.initializeAndSpawn(createMockFeature(), fullInput, true);

      expect(mockCreateFeatureUseCase.initializeAndSpawn).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          userInput: 'add auth',
          push: true,
          openPr: true,
          fast: true,
          agentType: 'claude-code',
          model: 'claude-opus-4-6',
        }),
        true
      );
    });

    it('should propagate errors from createFeature.initializeAndSpawn', async () => {
      vi.mocked(mockCreateFeatureUseCase.initializeAndSpawn).mockRejectedValue(
        new Error('Worktree creation failed')
      );

      await expect(
        useCase.initializeAndSpawn(createMockFeature(), baseInput, true)
      ).rejects.toThrow('Worktree creation failed');
    });
  });
});
