import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubReviewService } from '@/infrastructure/services/code-review/github-review.service.js';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service.js';
import {
  PlatformReviewError,
  PlatformReviewErrorCode,
} from '@/application/ports/output/services/platform-review-service.interface.js';

describe('GitHubReviewService', () => {
  let mockExec: ExecFunction;
  let service: GitHubReviewService;

  beforeEach(() => {
    mockExec = vi.fn();
    service = new GitHubReviewService(mockExec);
  });

  describe('fetchPrMetadata', () => {
    it('parses gh api output into PrMetadata', async () => {
      // First call: PR metadata
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify({
          title: 'feat: add auth',
          body: 'Adds JWT auth.',
          base: { ref: 'main' },
          head: { ref: 'feat/auth' },
          html_url: 'https://github.com/owner/repo/pull/42',
          commits: 3,
        }),
        stderr: '',
      });

      // Second call: commit messages
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify([
          { commit: { message: 'feat: add login' } },
          { commit: { message: 'feat: add token refresh\n\nMore details' } },
        ]),
        stderr: '',
      });

      const result = await service.fetchPrMetadata('owner', 'repo', 42);

      expect(result).toEqual({
        title: 'feat: add auth',
        description: 'Adds JWT auth.',
        baseBranch: 'main',
        headBranch: 'feat/auth',
        commits: ['feat: add login', 'feat: add token refresh'],
        owner: 'owner',
        repo: 'repo',
        prNumber: 42,
        prUrl: 'https://github.com/owner/repo/pull/42',
      });

      // Verify gh api was called with correct endpoint
      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        ['api', '/repos/owner/repo/pulls/42', '--method', 'GET'],
        {}
      );
    });
  });

  describe('fetchPrDiff', () => {
    it('parses patch fields into FileDiff[]', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            filename: 'src/utils.ts',
            status: 'modified',
            additions: 2,
            deletions: 1,
            patch:
              '@@ -10,3 +10,4 @@\n function helper() {\n-  return null;\n+  return undefined;\n+  // fixed\n }',
          },
          {
            filename: 'src/new.ts',
            status: 'added',
            additions: 1,
            deletions: 0,
            patch: '@@ -0,0 +1 @@\n+const x = 1;',
          },
        ]),
        stderr: '',
      });

      const result = await service.fetchPrDiff('owner', 'repo', 42);

      expect(result).toHaveLength(2);

      // First file
      expect(result[0].path).toBe('src/utils.ts');
      expect(result[0].status).toBe('modified');
      expect(result[0].additions).toBe(2);
      expect(result[0].deletions).toBe(1);
      expect(result[0].hunks).toHaveLength(1);
      expect(result[0].hunks[0].lines).toHaveLength(5);

      // Second file
      expect(result[1].path).toBe('src/new.ts');
      expect(result[1].status).toBe('added');
      expect(result[1].hunks[0].lines[0].type).toBe('added');
      expect(result[1].hunks[0].lines[0].newNumber).toBe(1);
    });

    it('handles renamed files with previous_filename', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            filename: 'src/new-name.ts',
            status: 'renamed',
            additions: 0,
            deletions: 0,
            patch: '',
            previous_filename: 'src/old-name.ts',
          },
        ]),
        stderr: '',
      });

      const result = await service.fetchPrDiff('owner', 'repo', 42);

      expect(result[0].path).toBe('src/new-name.ts');
      expect(result[0].oldPath).toBe('src/old-name.ts');
      expect(result[0].status).toBe('renamed');
    });

    it('handles binary files with no patch', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            filename: 'assets/logo.png',
            status: 'modified',
            additions: 0,
            deletions: 0,
          },
        ]),
        stderr: '',
      });

      const result = await service.fetchPrDiff('owner', 'repo', 42);

      expect(result[0].hunks).toHaveLength(0);
    });
  });

  describe('postReview', () => {
    it('constructs correct gh api command with line + side params', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify({
          html_url: 'https://github.com/owner/repo/pull/42#pullrequestreview-123',
        }),
        stderr: '',
      });

      const result = await service.postReview('owner', 'repo', 42, 'Summary', [
        { path: 'src/a.ts', line: 10, body: 'Bug.', side: 'RIGHT' },
        {
          path: 'src/b.ts',
          line: 20,
          body: 'Multi-line.',
          side: 'RIGHT',
          startLine: 15,
          startSide: 'RIGHT',
        },
      ]);

      expect(result.reviewUrl).toBe('https://github.com/owner/repo/pull/42#pullrequestreview-123');

      // Verify the payload was passed via --input -
      const calls = vi.mocked(mockExec).mock.calls;
      expect(calls[0][1]).toContain('--method');
      expect(calls[0][1]).toContain('POST');
      expect(calls[0][1]).toContain('--input');

      // Verify body content
      const options = calls[0][2] as { input: string };
      const payload = JSON.parse(options.input);
      expect(payload.event).toBe('COMMENT');
      expect(payload.body).toBe('Summary');
      expect(payload.comments).toHaveLength(2);
      expect(payload.comments[0]).toEqual({
        path: 'src/a.ts',
        line: 10,
        body: 'Bug.',
        side: 'RIGHT',
      });
      expect(payload.comments[1]).toEqual({
        path: 'src/b.ts',
        line: 20,
        body: 'Multi-line.',
        side: 'RIGHT',
        start_line: 15,
        start_side: 'RIGHT',
      });
    });

    it('always uses COMMENT event type', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify({ html_url: 'url' }),
        stderr: '',
      });

      await service.postReview('o', 'r', 1, 'body', []);

      const options = vi.mocked(mockExec).mock.calls[0][2] as { input: string };
      const payload = JSON.parse(options.input);
      expect(payload.event).toBe('COMMENT');
    });
  });

  describe('fetchExistingComments', () => {
    it('parses response into ExistingReviewComment[]', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            path: 'src/a.ts',
            line: 10,
            original_line: null,
            body: 'Fix this.',
            user: { login: 'reviewer1' },
          },
          {
            path: 'src/b.ts',
            line: null,
            original_line: 20,
            body: 'Old comment.',
            user: { login: 'reviewer2' },
          },
        ]),
        stderr: '',
      });

      const result = await service.fetchExistingComments('owner', 'repo', 42);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        path: 'src/a.ts',
        line: 10,
        body: 'Fix this.',
        author: 'reviewer1',
      });
      expect(result[1]).toEqual({
        path: 'src/b.ts',
        line: 20,
        body: 'Old comment.',
        author: 'reviewer2',
      });
    });

    it('filters out comments with no line number', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            path: 'src/a.ts',
            line: null,
            original_line: null,
            body: 'General comment.',
            user: { login: 'reviewer1' },
          },
        ]),
        stderr: '',
      });

      const result = await service.fetchExistingComments('owner', 'repo', 42);
      expect(result).toHaveLength(0);
    });
  });

  describe('retry logic', () => {
    it('retries on 429 status code', async () => {
      vi.mocked(mockExec)
        .mockRejectedValueOnce(new Error('HTTP 429 rate limit exceeded'))
        .mockRejectedValueOnce(new Error('HTTP 429 rate limit exceeded'))
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            title: 'PR',
            body: '',
            base: { ref: 'main' },
            head: { ref: 'feat' },
            html_url: 'url',
          }),
          stderr: '',
        })
        // Commit fetch
        .mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      const result = await service.fetchPrMetadata('o', 'r', 1);
      expect(result.title).toBe('PR');
      // Called 3 times for the metadata (2 retries + 1 success) + 1 for commits
      expect(mockExec).toHaveBeenCalledTimes(4);
    }, 15000);

    it('throws PlatformReviewError for non-retryable error', async () => {
      vi.mocked(mockExec).mockRejectedValue(new Error('HTTP 404 Not Found'));

      await expect(service.fetchPrMetadata('o', 'r', 999)).rejects.toThrow(PlatformReviewError);

      await expect(service.fetchPrMetadata('o', 'r', 999)).rejects.toMatchObject({
        code: PlatformReviewErrorCode.PR_NOT_FOUND,
      });
    });

    it('retries on 500 server error', async () => {
      vi.mocked(mockExec)
        .mockRejectedValueOnce(new Error('HTTP 500 Internal Server Error'))
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            title: 'PR',
            body: '',
            base: { ref: 'main' },
            head: { ref: 'feat' },
            html_url: 'url',
          }),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '[]', stderr: '' });

      const result = await service.fetchPrMetadata('o', 'r', 1);
      expect(result.title).toBe('PR');
    }, 10000);
  });
});
