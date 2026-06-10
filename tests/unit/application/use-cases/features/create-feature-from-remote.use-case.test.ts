/**
 * CreateFeatureFromRemoteUseCase Unit Tests
 *
 * Tests the composite use case that orchestrates ImportGitHubRepositoryUseCase
 * and CreateFeatureUseCase. Verifies call ordering, field passthrough, error
 * propagation, progress forwarding, deduplication, and two-phase methods.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateFeatureFromRemoteUseCase } from '@/application/use-cases/features/create/create-feature-from-remote.use-case.js';
import type { CreateFeatureFromRemoteInput } from '@/application/use-cases/features/create/create-feature-from-remote.use-case.js';
import type { ImportGitHubRepositoryUseCase } from '@/application/use-cases/repositories/import-github-repository.use-case.js';
import type { CreateFeatureUseCase } from '@/application/use-cases/features/create/create-feature.use-case.js';
import type { Repository, Feature } from '@/domain/generated/output.js';
import {
  GitHubAuthError,
  GitHubUrlParseError,
  GitHubCloneError,
} from '@/application/ports/output/services/github-repository-service.interface.js';

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
    id: 'feat-1',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'add dark mode',
    repositoryPath: '/home/user/repos/my-project',
    branch: 'feat/test-feature',
    lifecycle: 'Requirements' as Feature['lifecycle'],
    messages: [],
    relatedArtifacts: [],
    fast: false,
    push: false,
    openPr: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    buildMode: 'application' as Feature['buildMode'],
    forkAndPr: false,
    commitSpecs: false,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Type-level tests (task-1)
// ---------------------------------------------------------------------------

describe('CreateFeatureFromRemoteInput (type validation)', () => {
  it('should require remoteUrl as a string', () => {
    const input: CreateFeatureFromRemoteInput = {
      remoteUrl: 'https://github.com/owner/repo',
      userInput: 'add dark mode',
    };
    expect(input.remoteUrl).toBe('https://github.com/owner/repo');
  });

  it('should not include repositoryPath in the interface', () => {
    const input: CreateFeatureFromRemoteInput = {
      remoteUrl: 'owner/repo',
      userInput: 'add dark mode',
    };
    // repositoryPath should not exist on CreateFeatureFromRemoteInput
    expect('repositoryPath' in input).toBe(false);
  });

  it('should accept all optional import fields', () => {
    const onProgress = vi.fn();
    const input: CreateFeatureFromRemoteInput = {
      remoteUrl: 'owner/repo',
      userInput: 'add dark mode',
      cloneDest: '/custom/path',
      defaultCloneDir: '/home/repos',
      cloneOptions: { onProgress },
    };
    expect(input.cloneDest).toBe('/custom/path');
    expect(input.defaultCloneDir).toBe('/home/repos');
    expect(input.cloneOptions?.onProgress).toBe(onProgress);
  });

  it('should accept all optional CreateFeatureInput fields', () => {
    const input: CreateFeatureFromRemoteInput = {
      remoteUrl: 'owner/repo',
      userInput: 'add dark mode',
      approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
      push: true,
      openPr: true,
      parentId: 'parent-1',
      name: 'Dark Mode',
      description: 'Add dark mode support',
      fast: true,
      pending: false,
      agentType: 'claude-code',
      model: 'claude-opus-4-6',
      attachments: [],
      sessionId: 'session-1',
      attachmentPaths: ['/path/to/file.txt'],
    };
    expect(input.push).toBe(true);
    expect(input.model).toBe('claude-opus-4-6');
  });
});

// ---------------------------------------------------------------------------
// Use case tests (tasks 2-4)
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
      initializeAndSpawn: vi.fn().mockResolvedValue({
        warning: undefined,
        updatedFeature: mockFeature,
      }),
    } as unknown as CreateFeatureUseCase;

    useCase = new CreateFeatureFromRemoteUseCase(mockImportUseCase, mockCreateFeatureUseCase);
  });

  const baseInput: CreateFeatureFromRemoteInput = {
    remoteUrl: 'https://github.com/octocat/my-project',
    userInput: 'add dark mode',
  };

  // -------------------------------------------------------------------------
  // execute() — task-2
  // -------------------------------------------------------------------------

  describe('execute()', () => {
    it('should call ImportGitHubRepositoryUseCase.execute with correct URL and options', async () => {
      const onProgress = vi.fn();
      await useCase.execute({
        ...baseInput,
        cloneDest: '/custom/path',
        defaultCloneDir: '/home/repos',
        cloneOptions: { onProgress },
      });

      expect(mockImportUseCase.execute).toHaveBeenCalledWith({
        url: 'https://github.com/octocat/my-project',
        dest: '/custom/path',
        defaultCloneDir: '/home/repos',
        cloneOptions: { onProgress },
      });
    });

    it('should call CreateFeatureUseCase.execute with repository path from import result', async () => {
      await useCase.execute(baseInput);

      expect(mockCreateFeatureUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryPath: '/home/user/repos/my-project',
        })
      );
    });

    it('should call import BEFORE create (call order validation)', async () => {
      const callOrder: string[] = [];
      vi.mocked(mockImportUseCase.execute).mockImplementation(async () => {
        callOrder.push('import');
        return mockRepository;
      });
      vi.mocked(mockCreateFeatureUseCase.execute).mockImplementation(async () => {
        callOrder.push('create');
        return { feature: mockFeature, warning: undefined };
      });

      await useCase.execute(baseInput);

      expect(callOrder).toEqual(['import', 'create']);
    });

    it('should forward all CreateFeatureInput fields to CreateFeatureUseCase', async () => {
      const fullInput: CreateFeatureFromRemoteInput = {
        remoteUrl: 'owner/repo',
        userInput: 'add auth',
        approvalGates: { allowPrd: true, allowPlan: false, allowMerge: true },
        push: true,
        openPr: true,
        parentId: 'parent-1',
        name: 'Auth Feature',
        description: 'Add authentication',
        fast: true,
        pending: false,
        agentType: 'claude-code',
        model: 'claude-opus-4-6',
        attachments: [],
        sessionId: 'sess-1',
        attachmentPaths: ['/file.txt'],
      };

      await useCase.execute(fullInput);

      expect(mockCreateFeatureUseCase.execute).toHaveBeenCalledWith({
        userInput: 'add auth',
        repositoryPath: '/home/user/repos/my-project',
        approvalGates: { allowPrd: true, allowPlan: false, allowMerge: true },
        push: true,
        openPr: true,
        parentId: 'parent-1',
        name: 'Auth Feature',
        description: 'Add authentication',
        fast: true,
        pending: false,
        agentType: 'claude-code',
        model: 'claude-opus-4-6',
        attachments: [],
        sessionId: 'sess-1',
        attachmentPaths: ['/file.txt'],
      });
    });

    it('should forward cloneOptions.onProgress callback to import use case', async () => {
      const onProgress = vi.fn();
      await useCase.execute({
        ...baseInput,
        cloneOptions: { onProgress },
      });

      expect(mockImportUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          cloneOptions: { onProgress },
        })
      );
    });

    it('should return the Feature from CreateFeatureUseCase', async () => {
      const expectedFeature = createMockFeature({ id: 'feat-42', name: 'Dark Mode' });
      vi.mocked(mockCreateFeatureUseCase.execute).mockResolvedValue({
        feature: expectedFeature,
        warning: 'slug adjusted',
      });

      const result = await useCase.execute(baseInput);

      expect(result.feature).toBe(expectedFeature);
      expect(result.warning).toBe('slug adjusted');
    });

    it('should not include remoteUrl, cloneDest, defaultCloneDir, or cloneOptions in CreateFeatureInput', async () => {
      await useCase.execute({
        ...baseInput,
        cloneDest: '/custom',
        defaultCloneDir: '/default',
        cloneOptions: { onProgress: vi.fn() },
      });

      const createCall = vi.mocked(mockCreateFeatureUseCase.execute).mock.calls[0][0];
      expect(createCall).not.toHaveProperty('remoteUrl');
      expect(createCall).not.toHaveProperty('cloneDest');
      expect(createCall).not.toHaveProperty('defaultCloneDir');
      expect(createCall).not.toHaveProperty('cloneOptions');
    });
  });

  // -------------------------------------------------------------------------
  // createRecord() — task-3
  // -------------------------------------------------------------------------

  describe('createRecord()', () => {
    it('should call import then CreateFeatureUseCase.createRecord with correct path', async () => {
      const callOrder: string[] = [];
      vi.mocked(mockImportUseCase.execute).mockImplementation(async () => {
        callOrder.push('import');
        return mockRepository;
      });
      vi.mocked(mockCreateFeatureUseCase.createRecord).mockImplementation(async () => {
        callOrder.push('createRecord');
        return { feature: mockFeature, shouldSpawn: true };
      });

      await useCase.createRecord(baseInput);

      expect(callOrder).toEqual(['import', 'createRecord']);
      expect(mockCreateFeatureUseCase.createRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryPath: '/home/user/repos/my-project',
        })
      );
    });

    it('should return { feature, shouldSpawn } from inner createRecord', async () => {
      const expectedFeature = createMockFeature({ id: 'feat-99' });
      vi.mocked(mockCreateFeatureUseCase.createRecord).mockResolvedValue({
        feature: expectedFeature,
        shouldSpawn: false,
      });

      const result = await useCase.createRecord(baseInput);

      expect(result.feature).toBe(expectedFeature);
      expect(result.shouldSpawn).toBe(false);
    });

    it('should forward all input fields except repositoryPath to createRecord', async () => {
      const fullInput: CreateFeatureFromRemoteInput = {
        remoteUrl: 'owner/repo',
        userInput: 'add auth',
        fast: true,
        pending: true,
        model: 'claude-opus-4-6',
      };

      await useCase.createRecord(fullInput);

      expect(mockCreateFeatureUseCase.createRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          userInput: 'add auth',
          fast: true,
          pending: true,
          model: 'claude-opus-4-6',
        })
      );

      const createRecordCall = vi.mocked(mockCreateFeatureUseCase.createRecord).mock.calls[0][0];
      expect(createRecordCall).not.toHaveProperty('remoteUrl');
    });
  });

  // -------------------------------------------------------------------------
  // initializeAndSpawn() — task-3
  // -------------------------------------------------------------------------

  describe('initializeAndSpawn()', () => {
    it('should delegate to CreateFeatureUseCase.initializeAndSpawn', async () => {
      const feature = createMockFeature();
      const expectedResult = { warning: 'slug adjusted', updatedFeature: feature };
      vi.mocked(mockCreateFeatureUseCase.initializeAndSpawn).mockResolvedValue(expectedResult);

      const result = await useCase.initializeAndSpawn(feature, baseInput, true);

      expect(mockCreateFeatureUseCase.initializeAndSpawn).toHaveBeenCalledWith(
        feature,
        expect.objectContaining({
          userInput: 'add dark mode',
          repositoryPath: feature.repositoryPath,
        }),
        true
      );
      expect(result).toBe(expectedResult);
    });

    it('should not call import during initializeAndSpawn (import already done)', async () => {
      const feature = createMockFeature();

      await useCase.initializeAndSpawn(feature, baseInput, true);

      expect(mockImportUseCase.execute).not.toHaveBeenCalled();
    });

    it('should pass shouldSpawn=false correctly', async () => {
      const feature = createMockFeature();

      await useCase.initializeAndSpawn(feature, baseInput, false);

      expect(mockCreateFeatureUseCase.initializeAndSpawn).toHaveBeenCalledWith(
        feature,
        expect.any(Object),
        false
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error propagation — task-4
  // -------------------------------------------------------------------------

  describe('error propagation', () => {
    it('should propagate GitHubAuthError from import unchanged', async () => {
      const error = new GitHubAuthError('GitHub CLI is not authenticated');
      vi.mocked(mockImportUseCase.execute).mockRejectedValue(error);

      await expect(useCase.execute(baseInput)).rejects.toThrow(GitHubAuthError);
      await expect(useCase.execute(baseInput)).rejects.toThrow('GitHub CLI is not authenticated');
      expect(mockCreateFeatureUseCase.execute).not.toHaveBeenCalled();
    });

    it('should propagate GitHubUrlParseError from import unchanged', async () => {
      const error = new GitHubUrlParseError('Invalid GitHub URL: not-a-url');
      vi.mocked(mockImportUseCase.execute).mockRejectedValue(error);

      await expect(useCase.execute(baseInput)).rejects.toThrow(GitHubUrlParseError);
    });

    it('should propagate GitHubCloneError from import unchanged', async () => {
      const error = new GitHubCloneError('Clone failed: repository not found');
      vi.mocked(mockImportUseCase.execute).mockRejectedValue(error);

      await expect(useCase.execute(baseInput)).rejects.toThrow(GitHubCloneError);
    });

    it('should propagate error from CreateFeatureUseCase unchanged', async () => {
      vi.mocked(mockCreateFeatureUseCase.execute).mockRejectedValue(
        new Error('Agent "claude-code" is not available')
      );

      await expect(useCase.execute(baseInput)).rejects.toThrow(
        'Agent "claude-code" is not available'
      );
    });

    it('should propagate GitHubAuthError from createRecord phase', async () => {
      const error = new GitHubAuthError('Not authenticated');
      vi.mocked(mockImportUseCase.execute).mockRejectedValue(error);

      await expect(useCase.createRecord(baseInput)).rejects.toThrow(GitHubAuthError);
    });
  });

  // -------------------------------------------------------------------------
  // Deduplication passthrough — task-4
  // -------------------------------------------------------------------------

  describe('deduplication passthrough', () => {
    it('should use existing repo path when import returns already-imported repo', async () => {
      const existingRepo = createMockRepository({
        id: 'existing-id',
        path: '/home/user/repos/existing-project',
        remoteUrl: 'https://github.com/octocat/my-project',
      });
      vi.mocked(mockImportUseCase.execute).mockResolvedValue(existingRepo);

      await useCase.execute(baseInput);

      expect(mockCreateFeatureUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryPath: '/home/user/repos/existing-project',
        })
      );
    });
  });
});
