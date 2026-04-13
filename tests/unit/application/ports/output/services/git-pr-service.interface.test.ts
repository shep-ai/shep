import { describe, it, expect } from 'vitest';

import type {
  CiStatusResult,
  DiffSummary,
  IGitPrService,
  PrCreateResult,
} from '@/application/ports/output/services/git-pr-service.interface';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface';

describe('GitPrErrorCode', () => {
  it('should define all 13 error codes', () => {
    expect(Object.keys(GitPrErrorCode)).toHaveLength(13);
  });

  it.each([
    'MERGE_CONFLICT',
    'AUTH_FAILURE',
    'GH_NOT_FOUND',
    'NETWORK_ERROR',
    'CI_TIMEOUT',
    'BRANCH_NOT_FOUND',
    'GIT_ERROR',
    'MERGE_FAILED',
    'PR_NOT_FOUND',
    'REBASE_CONFLICT',
    'SYNC_FAILED',
    'REMOTE_ALREADY_EXISTS',
    'REPO_CREATE_FAILED',
  ] as const)('should have %s error code', (code) => {
    expect(GitPrErrorCode[code]).toBe(code);
  });
});

describe('GitPrError', () => {
  it('should be an instance of Error', () => {
    const error = new GitPrError('test', GitPrErrorCode.GIT_ERROR);
    expect(error).toBeInstanceOf(Error);
  });

  it('should set name to GitPrError', () => {
    const error = new GitPrError('test', GitPrErrorCode.GIT_ERROR);
    expect(error.name).toBe('GitPrError');
  });

  it('should set message and code', () => {
    const error = new GitPrError('something failed', GitPrErrorCode.MERGE_CONFLICT);
    expect(error.message).toBe('something failed');
    expect(error.code).toBe(GitPrErrorCode.MERGE_CONFLICT);
  });

  it('should accept an optional cause', () => {
    const cause = new Error('root cause');
    const error = new GitPrError('wrapped', GitPrErrorCode.NETWORK_ERROR, cause);
    expect(error.cause).toBe(cause);
  });

  it('should work without a cause', () => {
    const error = new GitPrError('no cause', GitPrErrorCode.AUTH_FAILURE);
    expect(error.cause).toBeUndefined();
  });
});

describe('CiStatusResult', () => {
  it('should accept all required and optional fields', () => {
    const result: CiStatusResult = {
      status: 'success',
      runUrl: 'https://github.com/org/repo/actions/runs/123',
      logExcerpt: 'All tests passed',
    };
    expect(result.status).toBe('success');
    expect(result.runUrl).toBeDefined();
    expect(result.logExcerpt).toBeDefined();
  });

  it('should allow optional fields to be omitted', () => {
    const result: CiStatusResult = { status: 'pending' };
    expect(result.status).toBe('pending');
    expect(result.runUrl).toBeUndefined();
    expect(result.logExcerpt).toBeUndefined();
  });

  it('should accept failure status', () => {
    const result: CiStatusResult = {
      status: 'failure',
      logExcerpt: 'Test suite failed',
    };
    expect(result.status).toBe('failure');
  });
});

describe('DiffSummary', () => {
  it('should hold all numeric diff statistics', () => {
    const summary: DiffSummary = {
      filesChanged: 5,
      additions: 120,
      deletions: 30,
      commitCount: 3,
    };
    expect(summary.filesChanged).toBe(5);
    expect(summary.additions).toBe(120);
    expect(summary.deletions).toBe(30);
    expect(summary.commitCount).toBe(3);
  });

  it('should accept zero values', () => {
    const summary: DiffSummary = {
      filesChanged: 0,
      additions: 0,
      deletions: 0,
      commitCount: 0,
    };
    expect(summary.filesChanged).toBe(0);
    expect(summary.additions).toBe(0);
    expect(summary.deletions).toBe(0);
    expect(summary.commitCount).toBe(0);
  });
});

describe('PrCreateResult', () => {
  it('should hold url and number', () => {
    const result: PrCreateResult = {
      url: 'https://github.com/org/repo/pull/42',
      number: 42,
    };
    expect(result.url).toBe('https://github.com/org/repo/pull/42');
    expect(result.number).toBe(42);
  });
});

describe('IGitPrService', () => {
  it('should be implementable with all methods', () => {
    // Compile-time check: a mock class implementing IGitPrService must provide all methods
    const mock: IGitPrService = {
      hasRemote: async () => true,
      getRemoteUrl: async () => 'https://github.com/org/repo',
      createGitHubRepo: async () => 'https://github.com/org/repo',
      addRemote: async () => {
        /* noop */
      },
      pull: async () => {
        /* noop */
      },
      getDefaultBranch: async () => 'main',
      hasUncommittedChanges: async () => false,
      commitAll: async () => 'abc123',
      push: async () => {
        /* noop */
      },
      createPr: async () => ({ url: '', number: 0 }),
      mergePr: async () => {
        /* noop */
      },
      mergeBranch: async () => {
        /* noop */
      },
      getCiStatus: async () => ({ status: 'pending' }),
      watchCi: async () => ({ status: 'success' }),
      deleteBranch: async () => {
        /* noop */
      },
      getFileDiffs: async () => [],
      getPrDiffSummary: async () => ({
        filesChanged: 0,
        additions: 0,
        deletions: 0,
        commitCount: 0,
      }),
      listPrStatuses: async () => [],
      verifyMerge: async () => true,
      revParse: async () => 'abc123',
      getFailureLogs: async () => '',
      getMergeableStatus: async () => undefined,
      localMergeSquash: async () => {
        /* noop */
      },
      syncMain: async () => {
        /* noop */
      },
      rebaseOnMain: async () => {
        /* noop */
      },
      getConflictedFiles: async () => [],
      stageFiles: async () => {
        /* noop */
      },
      rebaseContinue: async () => {
        /* noop */
      },
      rebaseAbort: async () => {
        /* noop */
      },
      getBranchSyncStatus: async () => {
        return { ahead: 0, behind: 0 };
      },
      stash: async () => false,
      stashPop: async () => {
        /* noop */
      },
      stashDrop: async () => {
        /* noop */
      },
    };

    // Verify all methods exist
    const methodNames: (keyof IGitPrService)[] = [
      'hasRemote',
      'getRemoteUrl',
      'createGitHubRepo',
      'addRemote',
      'getDefaultBranch',
      'hasUncommittedChanges',
      'commitAll',
      'push',
      'createPr',
      'mergePr',
      'mergeBranch',
      'getCiStatus',
      'watchCi',
      'deleteBranch',
      'getFileDiffs',
      'getPrDiffSummary',
      'listPrStatuses',
      'verifyMerge',
      'revParse',
      'getFailureLogs',
      'getMergeableStatus',
      'localMergeSquash',
      'syncMain',
      'rebaseOnMain',
      'getConflictedFiles',
      'stageFiles',
      'rebaseContinue',
      'rebaseAbort',
      'getBranchSyncStatus',
      'stash',
      'stashPop',
      'stashDrop',
    ];

    expect(methodNames).toHaveLength(32);
    for (const name of methodNames) {
      expect(typeof mock[name]).toBe('function');
    }
  });
});
