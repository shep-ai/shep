import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrStatus, CiStatus } from '@shepai/core/domain/generated/output';

const mockFindById = vi.fn();
const mockGetPrDiffSummary = vi.fn();
const mockGetFileDiffs = vi.fn();
const mockGetDefaultBranch = vi.fn<(cwd: string) => Promise<string>>().mockResolvedValue('main');
const mockComputeWorktreePath = vi.fn(
  (_repoPath: string, branch: string) => `/computed/wt/${branch.replace(/\//g, '-')}`
);
const mockExistsSync = vi.fn<(path: string) => boolean>(() => false);
const mockReadFileSync = vi.fn<(path: string, encoding: string) => string>(() => '[]');

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token === 'IFeatureRepository') return { findById: mockFindById };
    if (token === 'IGitPrService')
      return {
        getPrDiffSummary: mockGetPrDiffSummary,
        getFileDiffs: mockGetFileDiffs,
        getDefaultBranch: mockGetDefaultBranch,
      };
    throw new Error(`Unknown token: ${token}`);
  },
}));

vi.mock('@shepai/core/infrastructure/services/ide-launchers/compute-worktree-path', () => ({
  computeWorktreePath: (...args: unknown[]) =>
    mockComputeWorktreePath(...(args as [string, string])),
}));

vi.mock('@shepai/core/infrastructure/services/filesystem/shep-directory.service', () => ({
  getShepHomeDir: () => '/home/test/.shep',
}));

vi.mock('node:fs', () => {
  const mock = {
    existsSync: (...args: unknown[]) => mockExistsSync(...(args as [string])),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...(args as [string, string])),
  };
  return { ...mock, default: mock };
});

vi.mock('@shepai/core/infrastructure/services/settings.service', () => ({
  getSettings: () => ({
    workflow: {
      enableEvidence: false,
      commitEvidence: false,
      hideCiStatus: false,
    },
  }),
}));

const { getMergeReviewData } = await import(
  '../../../../../../src/presentation/web/app/actions/get-merge-review-data.js'
);

const basePr = {
  url: 'https://github.com/org/repo/pull/42',
  number: 42,
  status: PrStatus.Open,
  commitHash: 'abc1234def',
  ciStatus: CiStatus.Success,
};

const baseFeature = {
  id: 'feat-123',
  name: 'Test Feature',
  branch: 'feat/test-feature',
  repositoryPath: '/Users/test/repo',
  worktreePath: '/tmp/worktree',
  pr: basePr,
};

const baseDiffSummary = {
  filesChanged: 10,
  additions: 200,
  deletions: 50,
  commitCount: 3,
};

const baseFileDiffs = [
  {
    path: 'src/app.ts',
    additions: 5,
    deletions: 2,
    status: 'modified' as const,
    hunks: [{ header: '@@ -1,3 +1,6 @@', lines: [] }],
  },
];

describe('getMergeReviewData server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: file diffs unavailable
    mockGetFileDiffs.mockRejectedValue(new Error('no diffs'));
  });

  it('returns error when featureId is empty string', async () => {
    const result = await getMergeReviewData('');

    expect(result).toEqual({ error: 'Feature id is required' });
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns error when featureId is whitespace-only', async () => {
    const result = await getMergeReviewData('   ');

    expect(result).toEqual({ error: 'Feature id is required' });
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns error when feature is not found', async () => {
    mockFindById.mockResolvedValue(null);

    const result = await getMergeReviewData('nonexistent');

    expect(result).toEqual({ error: 'Feature not found' });
  });

  it('returns data without PR when feature has no PR', async () => {
    mockFindById.mockResolvedValue({ ...baseFeature, pr: undefined });
    mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);

    const result = await getMergeReviewData('feat-123');

    expect(result).toMatchObject({ pr: undefined, diffSummary: baseDiffSummary });
    expect(result).toHaveProperty('branch', { source: 'feat/test-feature', target: 'main' });
  });

  it('returns warning when feature has no PR, no worktree, and no repo+branch', async () => {
    mockFindById.mockResolvedValue({
      ...baseFeature,
      pr: undefined,
      worktreePath: undefined,
      repositoryPath: undefined,
      branch: undefined,
    });

    const result = await getMergeReviewData('feat-123');

    expect(result).toMatchObject({
      pr: undefined,
      warning: 'No PR or diff data available',
    });
  });

  it('returns full data when PR and diff summary are available', async () => {
    mockFindById.mockResolvedValue(baseFeature);
    mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);

    const result = await getMergeReviewData('feat-123');

    expect(result).toMatchObject({
      pr: {
        url: 'https://github.com/org/repo/pull/42',
        number: 42,
        status: PrStatus.Open,
        commitHash: 'abc1234def',
        ciStatus: CiStatus.Success,
      },
      diffSummary: baseDiffSummary,
      branch: { source: 'feat/test-feature', target: 'main' },
    });
    expect(mockGetPrDiffSummary).toHaveBeenCalledWith('/tmp/worktree', 'main');
  });

  it('returns data with warning when diff summary fails', async () => {
    mockFindById.mockResolvedValue(baseFeature);
    mockGetPrDiffSummary.mockRejectedValue(new Error('git not available'));

    const result = await getMergeReviewData('feat-123');

    expect(result).toMatchObject({
      pr: {
        url: 'https://github.com/org/repo/pull/42',
        number: 42,
        status: PrStatus.Open,
        commitHash: 'abc1234def',
        ciStatus: CiStatus.Success,
      },
      warning: 'Diff statistics unavailable',
    });
  });

  it('computes worktree path fallback when worktreePath is undefined but repo+branch exist', async () => {
    mockFindById.mockResolvedValue({ ...baseFeature, worktreePath: undefined });
    mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);

    const result = await getMergeReviewData('feat-123');

    expect(mockComputeWorktreePath).toHaveBeenCalledWith(
      baseFeature.repositoryPath,
      baseFeature.branch
    );
    expect(mockGetPrDiffSummary).toHaveBeenCalledWith('/computed/wt/feat-test-feature', 'main');
    expect(result).toMatchObject({ diffSummary: baseDiffSummary });
  });

  it('returns PR data without optional fields when they are absent', async () => {
    const minimalPr = {
      url: 'https://github.com/org/repo/pull/1',
      number: 1,
      status: PrStatus.Open,
    };
    mockFindById.mockResolvedValue({
      ...baseFeature,
      pr: minimalPr,
      worktreePath: undefined,
      repositoryPath: undefined,
      branch: undefined,
    });

    const result = await getMergeReviewData('feat-123');

    expect('pr' in result && result.pr?.commitHash).toBeUndefined();
    expect('pr' in result && result.pr?.ciStatus).toBeUndefined();
  });

  it('includes branch info from feature', async () => {
    mockFindById.mockResolvedValue(baseFeature);
    mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);

    const result = await getMergeReviewData('feat-123');

    expect(result).toMatchObject({
      branch: { source: 'feat/test-feature', target: 'main' },
    });
  });

  it('returns undefined branch when feature has no branch', async () => {
    mockFindById.mockResolvedValue({ ...baseFeature, branch: undefined });
    mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);

    const result = await getMergeReviewData('feat-123');

    expect(result).toMatchObject({ branch: undefined });
  });

  it('uses detected default branch instead of hardcoded main', async () => {
    mockGetDefaultBranch.mockResolvedValue('master');
    mockFindById.mockResolvedValue(baseFeature);
    mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);

    const result = await getMergeReviewData('feat-123');

    expect(result).toMatchObject({
      branch: { source: 'feat/test-feature', target: 'master' },
      diffSummary: baseDiffSummary,
    });
    expect(mockGetPrDiffSummary).toHaveBeenCalledWith('/tmp/worktree', 'master');
  });

  it('falls back to main when getDefaultBranch fails', async () => {
    mockGetDefaultBranch.mockRejectedValue(new Error('detection failed'));
    mockFindById.mockResolvedValue(baseFeature);
    mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);

    const result = await getMergeReviewData('feat-123');

    expect(result).toMatchObject({
      branch: { source: 'feat/test-feature', target: 'main' },
    });
    expect(mockGetPrDiffSummary).toHaveBeenCalledWith('/tmp/worktree', 'main');
  });

  it('returns error when repository throws', async () => {
    mockFindById.mockRejectedValue(new Error('Database error'));

    const result = await getMergeReviewData('feat-123');

    expect(result).toEqual({ error: 'Database error' });
  });

  it('returns generic error when repository throws non-Error', async () => {
    mockFindById.mockRejectedValue('something unexpected');

    const result = await getMergeReviewData('feat-123');

    expect(result).toEqual({ error: 'Failed to load merge review data' });
  });

  it('includes fileDiffs when getFileDiffs succeeds', async () => {
    mockFindById.mockResolvedValue(baseFeature);
    mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);
    mockGetFileDiffs.mockResolvedValue(baseFileDiffs);

    const result = await getMergeReviewData('feat-123');

    expect(result).toMatchObject({
      diffSummary: baseDiffSummary,
      fileDiffs: baseFileDiffs,
    });
    expect(mockGetFileDiffs).toHaveBeenCalledWith('/tmp/worktree', 'main');
  });

  it('returns undefined fileDiffs and a warning when getFileDiffs fails', async () => {
    mockFindById.mockResolvedValue(baseFeature);
    mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);
    mockGetFileDiffs.mockRejectedValue(new Error('git error'));

    const result = await getMergeReviewData('feat-123');

    expect(result).toMatchObject({
      diffSummary: baseDiffSummary,
      fileDiffs: undefined,
      warning: 'File diffs unavailable',
    });
  });

  describe('evidence loading', () => {
    const evidenceManifest = [
      {
        type: 'Screenshot',
        capturedAt: '2026-01-01T12:00:00Z',
        description: 'Homepage screenshot',
        relativePath: '/home/test/.shep/repos/abcdef0123456789/evidence/feat-123/homepage.png',
        taskRef: 'task-1',
      },
    ];

    it('loads evidence from shep evidence dir using repositoryPath', async () => {
      mockFindById.mockResolvedValue(baseFeature);
      mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(evidenceManifest));

      const result = await getMergeReviewData('feat-123');

      expect(result).toMatchObject({ evidence: evidenceManifest });
    });

    it('loads evidence even when worktree path does not exist on disk (post-merge)', async () => {
      // Feature still has repositoryPath and branch but worktree was deleted
      mockFindById.mockResolvedValue({
        ...baseFeature,
        worktreePath: undefined, // worktreePath not stored
      });
      mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(evidenceManifest));

      const result = await getMergeReviewData('feat-123');

      // Evidence should still be loaded via repositoryPath hash computation
      expect(result).toMatchObject({ evidence: evidenceManifest });
    });

    it('normalizes relative evidence paths to absolute paths in evidence dir', async () => {
      const relativeManifest = [
        {
          type: 'Screenshot',
          capturedAt: '2026-01-01T12:00:00Z',
          description: 'Homepage screenshot',
          relativePath: 'specs/066-feature/evidence/homepage.png',
          taskRef: 'task-1',
        },
      ];
      mockFindById.mockResolvedValue(baseFeature);
      mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(relativeManifest));

      const result = await getMergeReviewData('feat-123');

      // Relative path should be resolved to evidence dir + basename
      expect('evidence' in result && result.evidence?.[0]?.relativePath).toMatch(
        /evidence\/feat-123\/homepage\.png$/
      );
      expect('evidence' in result && result.evidence?.[0]?.relativePath).toMatch(/^\//);
    });

    it('returns no evidence when manifest does not exist', async () => {
      mockFindById.mockResolvedValue(baseFeature);
      mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);
      mockExistsSync.mockReturnValue(false);

      const result = await getMergeReviewData('feat-123');

      expect(result).toMatchObject({ evidence: undefined });
    });

    it('deduplicates evidence entries with the same type and relativePath', async () => {
      const duplicateManifest = [
        {
          type: 'Screenshot',
          capturedAt: '2026-01-01T12:00:00Z',
          description: 'Homepage screenshot',
          relativePath: '/home/test/.shep/repos/abcdef0123456789/evidence/feat-123/homepage.png',
          taskRef: 'task-1',
        },
        {
          type: 'Screenshot',
          capturedAt: '2026-01-01T12:01:00Z',
          description: 'Homepage screenshot (duplicate)',
          relativePath: '/home/test/.shep/repos/abcdef0123456789/evidence/feat-123/homepage.png',
          taskRef: 'task-1',
        },
        {
          type: 'Video',
          capturedAt: '2026-01-01T12:02:00Z',
          description: 'Demo video',
          relativePath: '/home/test/.shep/repos/abcdef0123456789/evidence/feat-123/demo.mp4',
        },
      ];
      mockFindById.mockResolvedValue(baseFeature);
      mockGetPrDiffSummary.mockResolvedValue(baseDiffSummary);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(duplicateManifest));

      const result = await getMergeReviewData('feat-123');

      expect('evidence' in result && result.evidence).toHaveLength(2);
      expect('evidence' in result && result.evidence?.[0]?.description).toBe('Homepage screenshot');
      expect('evidence' in result && result.evidence?.[1]?.description).toBe('Demo video');
    });

    it('returns no evidence when repositoryPath and worktreePath are both absent', async () => {
      mockFindById.mockResolvedValue({
        ...baseFeature,
        worktreePath: undefined,
        repositoryPath: undefined,
        branch: undefined,
      });

      const result = await getMergeReviewData('feat-123');

      expect(result).toMatchObject({ evidence: undefined });
    });
  });
});
