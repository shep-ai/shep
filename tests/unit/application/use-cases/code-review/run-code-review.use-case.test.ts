/**
 * RunCodeReviewUseCase Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RunCodeReviewUseCase,
  parsePrUrl,
  buildValidLineMap,
  isCommentInDiffRange,
} from '@/application/use-cases/code-review/run-code-review.use-case.js';
import type { ICodeReviewRepository } from '@/application/ports/output/repositories/code-review-repository.interface.js';
import type { IPlatformReviewService } from '@/application/ports/output/services/platform-review-service.interface.js';
import type { IStructuredAgentCaller } from '@/application/ports/output/agents/structured-agent-caller.interface.js';
import type {
  IGitPrService,
  FileDiff,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import { CodeReviewStatus, CommentSide } from '@/domain/generated/output.js';
import type {
  DiffAnnotator,
  PromptBuilder,
  OutputParser,
} from '@/application/use-cases/code-review/run-code-review.use-case.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRepo(): ICodeReviewRepository {
  return {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findByFeatureId: vi.fn(),
    findByPrNumber: vi.fn(),
    list: vi.fn(),
  };
}

function createMockPlatformService(): IPlatformReviewService {
  return {
    fetchPrMetadata: vi.fn().mockResolvedValue({
      title: 'feat: add auth',
      description: 'Adds OAuth login',
      baseBranch: 'main',
      headBranch: 'feat/auth',
      commits: ['initial commit'],
      owner: 'octocat',
      repo: 'hello-world',
      prNumber: 42,
      prUrl: 'https://github.com/octocat/hello-world/pull/42',
    }),
    fetchPrDiff: vi.fn().mockResolvedValue(createMockDiffs()),
    postReview: vi.fn(),
    fetchExistingComments: vi.fn().mockResolvedValue([]),
  };
}

function createMockStructuredCaller(): IStructuredAgentCaller {
  return {
    call: vi.fn().mockResolvedValue({
      summary: 'Found 1 issue',
      comments: [
        {
          path: 'src/auth.ts',
          line: 10,
          body: 'Missing null check',
          side: 'RIGHT',
        },
      ],
    }),
  };
}

function createMockGitPrService(): IGitPrService {
  return {
    getFileDiffs: vi.fn().mockResolvedValue(createMockDiffs()),
    hasRemote: vi.fn(),
    getRemoteUrl: vi.fn(),
    createGitHubRepo: vi.fn(),
    addRemote: vi.fn(),
    pull: vi.fn(),
    getDefaultBranch: vi.fn(),
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
    listPrStatuses: vi.fn(),
    verifyMerge: vi.fn(),
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

function createMockDiffs(): FileDiff[] {
  return [
    {
      path: 'src/auth.ts',
      additions: 5,
      deletions: 2,
      status: 'modified',
      hunks: [
        {
          header: '@@ -5,7 +5,10 @@',
          lines: [
            {
              type: 'context',
              content: 'import express from "express";',
              oldNumber: 5,
              newNumber: 5,
            },
            { type: 'removed', content: 'const auth = null;', oldNumber: 6 },
            { type: 'added', content: 'const auth = new AuthService();', newNumber: 6 },
            { type: 'added', content: 'auth.configure();', newNumber: 7 },
            { type: 'context', content: '', oldNumber: 7, newNumber: 8 },
            { type: 'added', content: 'function validate(token: string) {', newNumber: 9 },
            { type: 'added', content: '  return auth.verify(token);', newNumber: 10 },
            { type: 'added', content: '}', newNumber: 11 },
          ],
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parsePrUrl', () => {
  it('should parse standard GitHub PR URL', () => {
    const result = parsePrUrl('https://github.com/octocat/hello-world/pull/42');
    expect(result).toEqual({ owner: 'octocat', repo: 'hello-world', prNumber: 42 });
  });

  it('should parse URL without protocol', () => {
    const result = parsePrUrl('github.com/owner/repo/pull/7');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', prNumber: 7 });
  });

  it('should parse URL with www prefix', () => {
    const result = parsePrUrl('https://www.github.com/org/project/pull/100');
    expect(result).toEqual({ owner: 'org', repo: 'project', prNumber: 100 });
  });

  it('should return null for non-PR URLs', () => {
    expect(parsePrUrl('https://github.com/owner/repo')).toBeNull();
    expect(parsePrUrl('not a url')).toBeNull();
    expect(parsePrUrl('42')).toBeNull();
  });
});

describe('buildValidLineMap', () => {
  it('should build correct line sets from diffs', () => {
    const diffs = createMockDiffs();
    const map = buildValidLineMap(diffs);

    const authEntry = map.get('src/auth.ts');
    expect(authEntry).toBeDefined();
    expect(authEntry!.right.has(10)).toBe(true); // added line
    expect(authEntry!.right.has(5)).toBe(true); // context line
    expect(authEntry!.left.has(6)).toBe(true); // removed line
    expect(authEntry!.right.has(999)).toBe(false); // not in diff
  });

  it('should return empty map for empty diffs', () => {
    const map = buildValidLineMap([]);
    expect(map.size).toBe(0);
  });
});

describe('isCommentInDiffRange', () => {
  it('should return true for valid RIGHT side comment', () => {
    const validLines = buildValidLineMap(createMockDiffs());
    expect(
      isCommentInDiffRange(
        { path: 'src/auth.ts', line: 10, body: 'test', side: CommentSide.Right },
        validLines
      )
    ).toBe(true);
  });

  it('should return true for valid LEFT side comment', () => {
    const validLines = buildValidLineMap(createMockDiffs());
    expect(
      isCommentInDiffRange(
        { path: 'src/auth.ts', line: 6, body: 'test', side: CommentSide.Left },
        validLines
      )
    ).toBe(true);
  });

  it('should return false for line outside diff', () => {
    const validLines = buildValidLineMap(createMockDiffs());
    expect(
      isCommentInDiffRange(
        { path: 'src/auth.ts', line: 999, body: 'test', side: CommentSide.Right },
        validLines
      )
    ).toBe(false);
  });

  it('should return false for unknown file', () => {
    const validLines = buildValidLineMap(createMockDiffs());
    expect(
      isCommentInDiffRange(
        { path: 'src/unknown.ts', line: 1, body: 'test', side: CommentSide.Right },
        validLines
      )
    ).toBe(false);
  });
});

describe('RunCodeReviewUseCase', () => {
  let useCase: RunCodeReviewUseCase;
  let mockRepo: ICodeReviewRepository;
  let mockPlatform: IPlatformReviewService;
  let mockCaller: IStructuredAgentCaller;
  let mockGitPr: IGitPrService;
  let annotator: DiffAnnotator;
  let promptBuilder: PromptBuilder;
  let outputParser: OutputParser;

  beforeEach(() => {
    mockRepo = createMockRepo();
    mockPlatform = createMockPlatformService();
    mockCaller = createMockStructuredCaller();
    mockGitPr = createMockGitPrService();
    annotator = vi.fn().mockReturnValue('annotated diff');
    promptBuilder = vi.fn().mockReturnValue({
      systemPrompt: 'system',
      userPrompt: 'user',
    });
    outputParser = vi.fn().mockImplementation((raw: string) => JSON.parse(raw));

    useCase = new RunCodeReviewUseCase(
      mockRepo,
      mockPlatform,
      mockCaller,
      mockGitPr,
      annotator,
      promptBuilder,
      outputParser
    );
  });

  it('should complete successful review flow with all mocked dependencies', async () => {
    const result = await useCase.execute({
      target: 'https://github.com/octocat/hello-world/pull/42',
      repositoryPath: '/repo',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.review.status).toBe(CodeReviewStatus.Completed);
      expect(result.review.summary).toBe('Found 1 issue');
      expect(result.review.comments).toHaveLength(1);
      expect(result.review.prNumber).toBe(42);
    }

    // Verify status transitions: create(Pending) → update(InProgress) → update(prUrl) → update(Completed)
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(mockRepo.update).toHaveBeenCalledTimes(3);
    const firstUpdate = vi.mocked(mockRepo.update).mock.calls[0][0];
    expect(firstUpdate.status).toBe(CodeReviewStatus.InProgress);
  });

  it('should parse PR URL to extract owner/repo/number', async () => {
    await useCase.execute({
      target: 'https://github.com/myorg/myrepo/pull/99',
    });

    expect(mockPlatform.fetchPrMetadata).toHaveBeenCalledWith('myorg', 'myrepo', 99);
  });

  it('should handle plain PR number with explicit owner/repo', async () => {
    await useCase.execute({
      target: '42',
      owner: 'octocat',
      repo: 'hello-world',
    });

    expect(mockPlatform.fetchPrMetadata).toHaveBeenCalledWith('octocat', 'hello-world', 42);
  });

  it('should return error for plain PR number without owner/repo', async () => {
    const result = await useCase.execute({ target: '42' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Cannot parse PR target');
    }
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('should use local git diff when repositoryPath is available', async () => {
    await useCase.execute({
      target: 'https://github.com/octocat/hello-world/pull/42',
      repositoryPath: '/local/repo',
    });

    expect(mockGitPr.getFileDiffs).toHaveBeenCalledWith('/local/repo', 'main');
    expect(mockPlatform.fetchPrDiff).not.toHaveBeenCalled();
  });

  it('should fall back to GitHub API when local git diff fails', async () => {
    vi.mocked(mockGitPr.getFileDiffs).mockRejectedValue(new Error('git error'));

    await useCase.execute({
      target: 'https://github.com/octocat/hello-world/pull/42',
      repositoryPath: '/local/repo',
    });

    expect(mockGitPr.getFileDiffs).toHaveBeenCalled();
    expect(mockPlatform.fetchPrDiff).toHaveBeenCalledWith('octocat', 'hello-world', 42);
  });

  it('should use GitHub API directly when no repositoryPath', async () => {
    await useCase.execute({
      target: 'https://github.com/octocat/hello-world/pull/42',
    });

    expect(mockGitPr.getFileDiffs).not.toHaveBeenCalled();
    expect(mockPlatform.fetchPrDiff).toHaveBeenCalledWith('octocat', 'hello-world', 42);
  });

  it('should set status to Failed when agent fails', async () => {
    vi.mocked(mockCaller.call).mockRejectedValue(new Error('Agent timeout'));

    const result = await useCase.execute({
      target: 'https://github.com/octocat/hello-world/pull/42',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Agent timeout');
    }

    // Last update should set status to Failed
    const lastUpdate = vi.mocked(mockRepo.update).mock.calls.at(-1)?.[0];
    expect(lastUpdate?.status).toBe(CodeReviewStatus.Failed);
    expect(lastUpdate?.errorMessage).toContain('Agent timeout');
  });

  it('should transition status: Pending → InProgress → Completed', async () => {
    await useCase.execute({
      target: 'https://github.com/octocat/hello-world/pull/42',
    });

    const createCall = vi.mocked(mockRepo.create).mock.calls[0][0];
    expect(createCall.status).toBe(CodeReviewStatus.Pending);

    const updateCalls = vi.mocked(mockRepo.update).mock.calls;
    expect(updateCalls[0][0].status).toBe(CodeReviewStatus.InProgress);
    expect(updateCalls.at(-1)?.[0].status).toBe(CodeReviewStatus.Completed);
  });

  it('should mark comments with inDiffRange based on diff validation', async () => {
    // Agent returns two comments: one valid (line 10) and one invalid (line 999)
    vi.mocked(mockCaller.call).mockResolvedValue({
      summary: 'Found issues',
      comments: [
        { path: 'src/auth.ts', line: 10, body: 'Valid', side: 'RIGHT' },
        { path: 'src/auth.ts', line: 999, body: 'Invalid', side: 'RIGHT' },
      ],
    });

    const result = await useCase.execute({
      target: 'https://github.com/octocat/hello-world/pull/42',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.review.comments).toHaveLength(2);
      expect(result.review.comments![0].inDiffRange).toBe(true);
      expect(result.review.comments![1].inDiffRange).toBe(false);
    }
  });

  it('should persist featureId when provided', async () => {
    await useCase.execute({
      target: 'https://github.com/octocat/hello-world/pull/42',
      featureId: 'feat-123',
    });

    const createCall = vi.mocked(mockRepo.create).mock.calls[0][0];
    expect(createCall.featureId).toBe('feat-123');
  });

  it('should call annotator with fetched diffs', async () => {
    const diffs = createMockDiffs();
    vi.mocked(mockPlatform.fetchPrDiff).mockResolvedValue(diffs);

    await useCase.execute({
      target: 'https://github.com/octocat/hello-world/pull/42',
    });

    expect(annotator).toHaveBeenCalledWith(diffs);
  });

  it('should call prompt builder with PR metadata and annotated diff', async () => {
    await useCase.execute({
      target: 'https://github.com/octocat/hello-world/pull/42',
    });

    expect(promptBuilder).toHaveBeenCalledWith(
      expect.objectContaining({
        prMetadata: expect.objectContaining({
          title: 'feat: add auth',
          baseBranch: 'main',
        }),
        annotatedDiff: 'annotated diff',
      })
    );
  });

  it('should handle agent failure gracefully with status=Failed', async () => {
    vi.mocked(mockCaller.call).mockRejectedValue(new Error('Model overloaded'));

    const result = await useCase.execute({
      target: 'https://github.com/octocat/hello-world/pull/42',
    });

    expect(result.ok).toBe(false);
    // Review should still exist in the repo with Failed status
    const lastUpdate = vi.mocked(mockRepo.update).mock.calls.at(-1)?.[0];
    expect(lastUpdate?.status).toBe(CodeReviewStatus.Failed);
    expect(lastUpdate?.errorMessage).toContain('Model overloaded');
  });
});
