import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictResolutionService } from '@/infrastructure/services/agents/conflict-resolution/conflict-resolution.service.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import { DEFAULT_AGENT_CALL_TIMEOUT_MS } from '@/infrastructure/services/agents/common/agent-timeouts.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface.js';

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from 'node:fs';
const mockedReadFileSync = vi.mocked(readFileSync);

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'ClaudeCode' as never,
    execute: vi.fn().mockResolvedValue({ result: 'resolved' }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

function createMockProvider(executor: IAgentExecutor): IAgentExecutorProvider {
  return {
    getExecutor: vi.fn().mockResolvedValue(executor),
  };
}

function createMockGitPrService(): IGitPrService {
  return {
    getConflictedFiles: vi.fn().mockResolvedValue([]),
    stageFiles: vi.fn().mockResolvedValue(undefined),
    rebaseContinue: vi.fn().mockResolvedValue(undefined),
    rebaseAbort: vi.fn().mockResolvedValue(undefined),
    getBranchSyncStatus: vi.fn().mockResolvedValue({ ahead: 0, behind: 0 }),
    // Other methods (not used by ConflictResolutionService)
    createBranch: vi.fn(),
    checkoutBranch: vi.fn(),
    hasUncommittedChanges: vi.fn(),
    hasRemote: vi.fn(),
    push: vi.fn(),
    createPr: vi.fn(),
    mergePr: vi.fn(),
    localMergeSquash: vi.fn(),
    getCiStatus: vi.fn(),
    watchCi: vi.fn(),
    deleteBranch: vi.fn(),
    getPrDiffSummary: vi.fn(),
    getFileDiffs: vi.fn(),
    listPrStatuses: vi.fn(),
    getMergeableStatus: vi.fn(),
    verifyMerge: vi.fn(),
    getDefaultBranch: vi.fn(),
    revParse: vi.fn(),
    getFailureLogs: vi.fn(),
    syncMain: vi.fn(),
    rebaseOnMain: vi.fn(),
    stash: vi.fn().mockResolvedValue(false),
    stashPop: vi.fn().mockResolvedValue(undefined),
    stashDrop: vi.fn().mockResolvedValue(undefined),
  } as unknown as IGitPrService;
}

describe('ConflictResolutionService', () => {
  let service: ConflictResolutionService;
  let mockExecutor: IAgentExecutor;
  let mockProvider: IAgentExecutorProvider;
  let mockGitPrService: IGitPrService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecutor = createMockExecutor();
    mockProvider = createMockProvider(mockExecutor);
    mockGitPrService = createMockGitPrService();
    service = new ConflictResolutionService(mockProvider, mockGitPrService);
  });

  it('should resolve conflicts on first attempt — stages and continues', async () => {
    // Setup: one conflicted file, then no conflicts after rebaseContinue
    vi.mocked(mockGitPrService.getConflictedFiles)
      .mockResolvedValueOnce(['src/index.ts'])
      .mockResolvedValueOnce([]);

    // First read: file has conflict markers (before agent resolves)
    // Second read (validation): file is clean after agent resolves
    mockedReadFileSync
      .mockReturnValueOnce('<<<<<<< HEAD\nbase\n=======\nfeature\n>>>>>>> feat/x' as never)
      .mockReturnValueOnce('merged content with no markers' as never);

    await service.resolve('/repo', 'feat/x', 'main');

    expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledWith('/repo', ['src/index.ts']);
    expect(mockGitPrService.rebaseContinue).toHaveBeenCalledWith('/repo');
    expect(mockGitPrService.rebaseAbort).not.toHaveBeenCalled();
  });

  it('should retry on failed first attempt and succeed on second', async () => {
    vi.mocked(mockGitPrService.getConflictedFiles)
      .mockResolvedValueOnce(['src/index.ts'])
      .mockResolvedValueOnce([]);

    // Attempt 1: read file for prompt, then validation fails (markers still present)
    // Attempt 2: read file for feedback, read for prompt, then validation passes
    mockedReadFileSync
      // Attempt 1: read for prompt
      .mockReturnValueOnce('<<<<<<< HEAD\nbase\n=======\nfeature\n>>>>>>> feat/x' as never)
      // Attempt 1: validation — still has markers
      .mockReturnValueOnce('<<<<<<< HEAD\nbase\n=======\nfeature\n>>>>>>> feat/x' as never)
      // Attempt 2: buildFeedbackFromRemainingMarkers
      .mockReturnValueOnce('<<<<<<< HEAD\nbase\n=======\nfeature\n>>>>>>> feat/x' as never)
      // Attempt 2: read for prompt
      .mockReturnValueOnce('<<<<<<< HEAD\nbase\n=======\nfeature\n>>>>>>> feat/x' as never)
      // Attempt 2: validation — clean
      .mockReturnValueOnce('merged content' as never);

    await service.resolve('/repo', 'feat/x', 'main');

    expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledWith('/repo', ['src/index.ts']);
    expect(mockGitPrService.rebaseContinue).toHaveBeenCalledWith('/repo');
  });

  it('should abort rebase after 3 failed attempts and throw REBASE_CONFLICT', async () => {
    vi.mocked(mockGitPrService.getConflictedFiles).mockResolvedValue(['src/index.ts']);

    // All reads return file with conflict markers (agent never succeeds)
    mockedReadFileSync.mockReturnValue(
      '<<<<<<< HEAD\nbase\n=======\nfeature\n>>>>>>> feat/x' as never
    );

    const error = await service.resolve('/repo', 'feat/x', 'main').catch((e) => e);

    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.REBASE_CONFLICT);
    expect(error.message).toContain('Failed to resolve conflicts after 3 attempts');
    expect(error.message).toContain('src/index.ts');

    expect(mockExecutor.execute).toHaveBeenCalledTimes(3);
    expect(mockGitPrService.rebaseAbort).toHaveBeenCalledWith('/repo');
    expect(mockGitPrService.stageFiles).not.toHaveBeenCalled();
  });

  it('should handle multi-commit rebase — resolves first commit then second', async () => {
    // First call: one conflicted file
    // After rebaseContinue: throws REBASE_CONFLICT (next commit has conflicts)
    // Second call: different conflicted file
    // After second rebaseContinue: succeeds

    vi.mocked(mockGitPrService.getConflictedFiles)
      .mockResolvedValueOnce(['src/a.ts']) // First commit conflicts
      .mockResolvedValueOnce(['src/b.ts']); // Second commit conflicts

    // First commit resolution
    mockedReadFileSync
      // Read for prompt (first commit)
      .mockReturnValueOnce('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feat/x' as never)
      // Validation (first commit) — clean
      .mockReturnValueOnce('resolved a' as never)
      // Read for prompt (second commit)
      .mockReturnValueOnce('<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> feat/x' as never)
      // Validation (second commit) — clean
      .mockReturnValueOnce('resolved b' as never);

    vi.mocked(mockGitPrService.rebaseContinue)
      .mockRejectedValueOnce(
        new GitPrError('Rebase continue encountered new conflicts', GitPrErrorCode.REBASE_CONFLICT)
      )
      .mockResolvedValueOnce(undefined);

    await service.resolve('/repo', 'feat/x', 'main');

    expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledTimes(2);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledWith('/repo', ['src/a.ts']);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledWith('/repo', ['src/b.ts']);
    expect(mockGitPrService.rebaseContinue).toHaveBeenCalledTimes(2);
  });

  it('should handle multi-commit rebase — rebaseContinue succeeds but next commit has conflicts', async () => {
    // Scenario: rebaseContinue does NOT throw REBASE_CONFLICT but the next
    // getConflictedFiles call finds conflicts on the subsequent commit.
    // This tests the loop continuation path after a successful rebaseContinue.

    vi.mocked(mockGitPrService.getConflictedFiles)
      .mockResolvedValueOnce(['src/a.ts']) // First commit conflicts
      .mockResolvedValueOnce(['src/b.ts']) // Second commit conflicts (found by loop re-check)
      .mockResolvedValueOnce([]); // No more conflicts

    mockedReadFileSync
      // First commit: read for prompt
      .mockReturnValueOnce('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feat/x' as never)
      // First commit: validation — clean
      .mockReturnValueOnce('resolved a' as never)
      // Second commit: read for prompt
      .mockReturnValueOnce('<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> feat/x' as never)
      // Second commit: validation — clean
      .mockReturnValueOnce('resolved b' as never);

    // Both rebaseContinue calls succeed without throwing
    vi.mocked(mockGitPrService.rebaseContinue).mockResolvedValue(undefined);

    await service.resolve('/repo', 'feat/x', 'main');

    expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledTimes(2);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledWith('/repo', ['src/a.ts']);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledWith('/repo', ['src/b.ts']);
    expect(mockGitPrService.rebaseContinue).toHaveBeenCalledTimes(2);
    // Verify the outer loop checked 3 times: conflicts, conflicts, empty
    expect(mockGitPrService.getConflictedFiles).toHaveBeenCalledTimes(3);
  });

  it('should handle three-commit rebase where only first and third have conflicts', async () => {
    // Commit 1: has conflicts → resolve → rebaseContinue → succeeds
    // Commit 2: no conflicts (clean apply) → rebaseContinue happens internally
    // Commit 3: has conflicts → resolve → rebaseContinue → succeeds → no more conflicts

    vi.mocked(mockGitPrService.getConflictedFiles)
      .mockResolvedValueOnce(['src/a.ts']) // First commit conflicts
      .mockResolvedValueOnce(['src/c.ts']) // Third commit conflicts (second was clean)
      .mockResolvedValueOnce([]); // No more conflicts

    mockedReadFileSync
      // First commit: read for prompt
      .mockReturnValueOnce('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feat/x' as never)
      // First commit: validation — clean
      .mockReturnValueOnce('resolved a' as never)
      // Third commit: read for prompt
      .mockReturnValueOnce('<<<<<<< HEAD\ne\n=======\nf\n>>>>>>> feat/x' as never)
      // Third commit: validation — clean
      .mockReturnValueOnce('resolved c' as never);

    // First rebaseContinue succeeds (commit 2 applies cleanly, commit 3 conflicts later)
    // Second rebaseContinue succeeds (all done)
    vi.mocked(mockGitPrService.rebaseContinue).mockResolvedValue(undefined);

    await service.resolve('/repo', 'feat/x', 'main');

    expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledTimes(2);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledWith('/repo', ['src/a.ts']);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledWith('/repo', ['src/c.ts']);
    expect(mockGitPrService.rebaseContinue).toHaveBeenCalledTimes(2);
    expect(mockGitPrService.getConflictedFiles).toHaveBeenCalledTimes(3);
  });

  it('should handle two-commit rebase with retries on second commit', async () => {
    // Commit 1: resolves on first attempt
    // Commit 2: fails first attempt, resolves on second attempt

    vi.mocked(mockGitPrService.getConflictedFiles)
      .mockResolvedValueOnce(['src/a.ts']) // First commit conflicts
      .mockResolvedValueOnce(['src/b.ts']) // Second commit conflicts
      .mockResolvedValueOnce([]); // No more conflicts

    mockedReadFileSync
      // First commit: read for prompt
      .mockReturnValueOnce('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feat/x' as never)
      // First commit: validation — clean
      .mockReturnValueOnce('resolved a' as never)
      // Second commit attempt 1: read for prompt
      .mockReturnValueOnce('<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> feat/x' as never)
      // Second commit attempt 1: validation — still has markers
      .mockReturnValueOnce('<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> feat/x' as never)
      // Second commit attempt 2: buildFeedbackFromRemainingMarkers
      .mockReturnValueOnce('<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> feat/x' as never)
      // Second commit attempt 2: read for prompt
      .mockReturnValueOnce('<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> feat/x' as never)
      // Second commit attempt 2: validation — clean
      .mockReturnValueOnce('resolved b' as never);

    vi.mocked(mockGitPrService.rebaseContinue).mockResolvedValue(undefined);

    await service.resolve('/repo', 'feat/x', 'main');

    // 1 attempt on first commit + 2 attempts on second commit = 3 total
    expect(mockExecutor.execute).toHaveBeenCalledTimes(3);
    expect(mockGitPrService.stageFiles).toHaveBeenCalledTimes(2);
    expect(mockGitPrService.rebaseContinue).toHaveBeenCalledTimes(2);
  });

  it('should return immediately when no conflicted files are found', async () => {
    vi.mocked(mockGitPrService.getConflictedFiles).mockResolvedValue([]);

    await service.resolve('/repo', 'feat/x', 'main');

    expect(mockExecutor.execute).not.toHaveBeenCalled();
    expect(mockGitPrService.stageFiles).not.toHaveBeenCalled();
    expect(mockGitPrService.rebaseContinue).not.toHaveBeenCalled();
  });

  it('should pass cwd to executor options', async () => {
    vi.mocked(mockGitPrService.getConflictedFiles)
      .mockResolvedValueOnce(['src/index.ts'])
      .mockResolvedValueOnce([]);

    mockedReadFileSync
      .mockReturnValueOnce('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feat/x' as never)
      .mockReturnValueOnce('clean' as never);

    await service.resolve('/my/worktree', 'feat/x', 'main');

    expect(mockExecutor.execute).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cwd: '/my/worktree' })
    );
  });

  // A wedged agent used to hang the rebase — and the merge waiting on it —
  // forever: neither call passed a timeout, so the executor never armed one.
  it('should bound the rebase-conflict agent call with the default agent timeout', async () => {
    vi.mocked(mockGitPrService.getConflictedFiles)
      .mockResolvedValueOnce(['src/index.ts'])
      .mockResolvedValueOnce([]);
    mockedReadFileSync
      .mockReturnValueOnce('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feat/x' as never)
      .mockReturnValueOnce('clean' as never);

    await service.resolve('/my/worktree', 'feat/x', 'main');

    expect(mockExecutor.execute).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: DEFAULT_AGENT_CALL_TIMEOUT_MS })
    );
  });

  it('should bound the stash-pop agent call with the default agent timeout', async () => {
    vi.mocked(mockGitPrService.getConflictedFiles).mockResolvedValue(['src/index.ts']);
    mockedReadFileSync
      .mockReturnValueOnce('<<<<<<< HEAD\nbase\n=======\nstashed\n>>>>>>> stash' as never)
      .mockReturnValueOnce('merged content' as never);

    await service.resolveStashPop('/repo', 'feat/x', 'main');

    expect(mockExecutor.execute).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: DEFAULT_AGENT_CALL_TIMEOUT_MS })
    );
  });

  describe('resolveStashPop', () => {
    it('should resolve stash pop conflicts — invokes agent, validates, stages', async () => {
      vi.mocked(mockGitPrService.getConflictedFiles).mockResolvedValue(['src/index.ts']);

      mockedReadFileSync
        // Read for prompt
        .mockReturnValueOnce('<<<<<<< HEAD\nbase\n=======\nstashed\n>>>>>>> stash' as never)
        // Validation — clean
        .mockReturnValueOnce('merged content' as never);

      await service.resolveStashPop('/repo', 'feat/x', 'main');

      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
      // Prompt should mention stash pop context
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        expect.stringContaining('stash pop'),
        expect.objectContaining({ cwd: '/repo' })
      );
      expect(mockGitPrService.stageFiles).toHaveBeenCalledWith('/repo', ['src/index.ts']);
    });

    it('should throw clear error after 3 failed stash pop resolution attempts', async () => {
      vi.mocked(mockGitPrService.getConflictedFiles).mockResolvedValue(['src/index.ts']);

      // All reads return file with conflict markers
      mockedReadFileSync.mockReturnValue(
        '<<<<<<< HEAD\nbase\n=======\nstashed\n>>>>>>> stash' as never
      );

      const error = await service.resolveStashPop('/repo', 'feat/x', 'main').catch((e) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('git stash pop');
      expect(error.message).toContain('3 attempts');
      expect(mockExecutor.execute).toHaveBeenCalledTimes(3);
    });

    it('should return immediately when no conflicted files from stash pop', async () => {
      vi.mocked(mockGitPrService.getConflictedFiles).mockResolvedValue([]);

      await service.resolveStashPop('/repo', 'feat/x', 'main');

      expect(mockExecutor.execute).not.toHaveBeenCalled();
      expect(mockGitPrService.stageFiles).not.toHaveBeenCalled();
    });
  });
});
