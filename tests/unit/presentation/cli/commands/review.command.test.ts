/**
 * Review Command Unit Tests
 *
 * Tests for the `shep review` command:
 *   - default action: trigger a new code review
 *   - show subcommand: display a completed review
 *   - list subcommand: list recent reviews
 *   - post subcommand: post a review to GitHub
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { CodeReviewStatus } from '@/domain/generated/output.js';
import type { CodeReview, ReviewComment } from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockContainerResolve,
  mockRunExecute,
  mockGetExecute,
  mockListExecute,
  mockPostExecute,
  mockGetRemoteUrl,
  mockParseGitHubUrl,
} = vi.hoisted(() => ({
  mockContainerResolve: vi.fn(),
  mockRunExecute: vi.fn(),
  mockGetExecute: vi.fn(),
  mockListExecute: vi.fn(),
  mockPostExecute: vi.fn(),
  mockGetRemoteUrl: vi.fn(),
  mockParseGitHubUrl: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockContainerResolve(...args),
  },
}));

vi.mock('@/application/use-cases/code-review/run-code-review.use-case.js', () => ({
  RunCodeReviewUseCase: class {
    execute = mockRunExecute;
  },
  parsePrUrl: (url: string) => {
    const match = url.match(
      /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i
    );
    if (!match) return null;
    return { owner: match[1], repo: match[2], prNumber: parseInt(match[3], 10) };
  },
}));

vi.mock('@/application/use-cases/code-review/get-code-review.use-case.js', () => ({
  GetCodeReviewUseCase: class {
    execute = mockGetExecute;
  },
}));

vi.mock('@/application/use-cases/code-review/list-code-reviews.use-case.js', () => ({
  ListCodeReviewsUseCase: class {
    execute = mockListExecute;
  },
}));

vi.mock('@/application/use-cases/code-review/post-code-review.use-case.js', () => ({
  PostCodeReviewUseCase: class {
    execute = mockPostExecute;
  },
}));

import { createReviewCommand } from '../../../../../src/presentation/cli/commands/review.command.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReview(overrides?: Partial<CodeReview>): CodeReview {
  return {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    repositoryPath: '/home/user/my-project',
    prNumber: 42,
    prUrl: 'https://github.com/octocat/my-project/pull/42',
    status: CodeReviewStatus.Completed,
    summary: 'Overall the code looks good with minor issues.',
    comments: [
      {
        path: 'src/index.ts',
        line: 10,
        body: 'Potential null dereference',
        side: 'RIGHT' as const,
        inDiffRange: true,
      },
      {
        path: 'src/utils.ts',
        line: 25,
        body: 'Consider using a constant here',
        side: 'RIGHT' as const,
        suggestion: 'const MAX_RETRIES = 3;',
        inDiffRange: true,
      },
    ] as ReviewComment[],
    createdAt: new Date('2025-03-15'),
    updatedAt: new Date('2025-03-15'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('review command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = undefined;

    mockContainerResolve.mockImplementation((token: unknown) => {
      const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
      switch (key) {
        case 'RunCodeReviewUseCase':
          return { execute: mockRunExecute };
        case 'GetCodeReviewUseCase':
          return { execute: mockGetExecute };
        case 'ListCodeReviewsUseCase':
          return { execute: mockListExecute };
        case 'PostCodeReviewUseCase':
          return { execute: mockPostExecute };
        case 'IGitPrService':
          return { getRemoteUrl: mockGetRemoteUrl };
        case 'IGitHubRepositoryService':
          return { parseGitHubUrl: mockParseGitHubUrl };
        default:
          return {};
      }
    });
  });

  // -----------------------------------------------------------------------
  // Command structure
  // -----------------------------------------------------------------------

  describe('command structure', () => {
    it('should create a valid Commander command named "review"', () => {
      const cmd = createReviewCommand();
      expect(cmd).toBeInstanceOf(Command);
      expect(cmd.name()).toBe('review');
    });

    it('should have a description', () => {
      const cmd = createReviewCommand();
      expect(cmd.description()).toBeTruthy();
    });

    it('should accept an optional [target] argument', () => {
      const cmd = createReviewCommand();
      const args = (cmd as any)._args;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe('target');
      expect(args[0].required).toBe(false);
    });

    it('should have --owner and --repo options', () => {
      const cmd = createReviewCommand();
      const ownerOpt = cmd.options.find((o) => o.long === '--owner');
      const repoOpt = cmd.options.find((o) => o.long === '--repo');
      expect(ownerOpt).toBeDefined();
      expect(repoOpt).toBeDefined();
    });

    it('should have --post option', () => {
      const cmd = createReviewCommand();
      const postOpt = cmd.options.find((o) => o.long === '--post');
      expect(postOpt).toBeDefined();
    });

    it('should have show, list, and post subcommands', () => {
      const cmd = createReviewCommand();
      const subcommands = cmd.commands.map((c) => c.name());
      expect(subcommands).toContain('show');
      expect(subcommands).toContain('list');
      expect(subcommands).toContain('post');
    });
  });

  // -----------------------------------------------------------------------
  // Default action (trigger review)
  // -----------------------------------------------------------------------

  describe('default action', () => {
    it('should trigger a review with a PR URL and display results', async () => {
      const review = makeReview();
      mockRunExecute.mockResolvedValue({ ok: true, review });

      const cmd = createReviewCommand();
      await cmd.parseAsync(['https://github.com/octocat/my-project/pull/42'], { from: 'user' });

      expect(mockRunExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'https://github.com/octocat/my-project/pull/42',
          owner: 'octocat',
          repo: 'my-project',
        })
      );
      expect(process.exitCode).toBeUndefined();
    });

    it('should trigger a review with a PR number and explicit owner/repo', async () => {
      const review = makeReview();
      mockRunExecute.mockResolvedValue({ ok: true, review });

      const cmd = createReviewCommand();
      await cmd.parseAsync(['42', '--owner', 'octocat', '--repo', 'my-project'], {
        from: 'user',
      });

      expect(mockRunExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          target: '42',
          owner: 'octocat',
          repo: 'my-project',
        })
      );
    });

    it('should resolve owner/repo from git remote when not provided', async () => {
      const review = makeReview();
      mockRunExecute.mockResolvedValue({ ok: true, review });
      mockGetRemoteUrl.mockResolvedValue('https://github.com/octocat/my-project.git');
      mockParseGitHubUrl.mockReturnValue({
        owner: 'octocat',
        repo: 'my-project',
        nameWithOwner: 'octocat/my-project',
      });

      const cmd = createReviewCommand();
      await cmd.parseAsync(['42'], { from: 'user' });

      expect(mockGetRemoteUrl).toHaveBeenCalled();
      expect(mockRunExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          target: '42',
          owner: 'octocat',
          repo: 'my-project',
        })
      );
    });

    it('should display summary and findings on success', async () => {
      const review = makeReview();
      mockRunExecute.mockResolvedValue({ ok: true, review });

      const cmd = createReviewCommand();
      await cmd.parseAsync(['https://github.com/octocat/my-project/pull/42'], { from: 'user' });

      const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('Overall the code looks good');
      expect(output).toContain('src/index.ts');
      expect(output).toContain('Potential null dereference');
      expect(output).toContain('src/utils.ts');
    });

    it('should display suggestions with + prefix', async () => {
      const review = makeReview();
      mockRunExecute.mockResolvedValue({ ok: true, review });

      const cmd = createReviewCommand();
      await cmd.parseAsync(['https://github.com/octocat/my-project/pull/42'], { from: 'user' });

      const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('MAX_RETRIES');
    });

    it('should set exitCode 1 on review failure', async () => {
      mockRunExecute.mockResolvedValue({
        ok: false,
        error: 'Cannot parse PR target: "invalid"',
      });

      const cmd = createReviewCommand();
      await cmd.parseAsync(['invalid', '--owner', 'x', '--repo', 'y'], { from: 'user' });

      expect(process.exitCode).toBe(1);
    });

    it('should set exitCode 1 on unexpected error', async () => {
      mockRunExecute.mockRejectedValue(new Error('Unexpected failure'));

      const cmd = createReviewCommand();
      await cmd.parseAsync(['https://github.com/octocat/my-project/pull/42'], { from: 'user' });

      expect(process.exitCode).toBe(1);
      const output = consoleErrorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('Failed to run code review');
    });

    it('should show post hint after successful review without --post', async () => {
      const review = makeReview();
      mockRunExecute.mockResolvedValue({ ok: true, review });

      const cmd = createReviewCommand();
      await cmd.parseAsync(['https://github.com/octocat/my-project/pull/42'], { from: 'user' });

      const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('shep review post');
    });
  });

  // -----------------------------------------------------------------------
  // show subcommand
  // -----------------------------------------------------------------------

  describe('show subcommand', () => {
    it('should display review details', async () => {
      const review = makeReview();
      mockGetExecute.mockResolvedValue(review);

      const cmd = createReviewCommand();
      await cmd.parseAsync(['show', 'a1b2c3d4'], { from: 'user' });

      expect(mockGetExecute).toHaveBeenCalledWith('a1b2c3d4');
      const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(output).toContain('#42');
    });

    it('should display review summary', async () => {
      const review = makeReview();
      mockGetExecute.mockResolvedValue(review);

      const cmd = createReviewCommand();
      await cmd.parseAsync(['show', 'a1b2c3d4'], { from: 'user' });

      const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('Overall the code looks good');
    });

    it('should display findings grouped by file', async () => {
      const review = makeReview();
      mockGetExecute.mockResolvedValue(review);

      const cmd = createReviewCommand();
      await cmd.parseAsync(['show', 'a1b2c3d4'], { from: 'user' });

      const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('src/index.ts');
      expect(output).toContain('Potential null dereference');
      expect(output).toContain('src/utils.ts');
    });

    it('should set exitCode 1 when review not found', async () => {
      mockGetExecute.mockRejectedValue(new Error('Code review not found: "xyz"'));

      const cmd = createReviewCommand();
      await cmd.parseAsync(['show', 'xyz'], { from: 'user' });

      expect(process.exitCode).toBe(1);
      const output = consoleErrorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('Failed to show code review');
    });

    it('should display error message for failed reviews', async () => {
      const review = makeReview({
        status: CodeReviewStatus.Failed,
        errorMessage: 'Agent timed out',
        comments: [],
      });
      mockGetExecute.mockResolvedValue(review);

      const cmd = createReviewCommand();
      await cmd.parseAsync(['show', 'a1b2c3d4'], { from: 'user' });

      const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('Agent timed out');
    });
  });

  // -----------------------------------------------------------------------
  // list subcommand
  // -----------------------------------------------------------------------

  describe('list subcommand', () => {
    it('should display a table of reviews', async () => {
      const reviews = [
        makeReview(),
        makeReview({
          id: 'deadbeef-1234-5678-abcd-ef1234567890',
          prNumber: 43,
          status: CodeReviewStatus.Posted,
          comments: [],
        }),
      ];
      mockListExecute.mockResolvedValue(reviews);

      const cmd = createReviewCommand();
      await cmd.parseAsync(['list'], { from: 'user' });

      const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('a1b2c3d4');
      expect(output).toContain('#42');
      expect(output).toContain('deadbeef');
      expect(output).toContain('#43');
    });

    it('should show empty message when no reviews exist', async () => {
      mockListExecute.mockResolvedValue([]);

      const cmd = createReviewCommand();
      await cmd.parseAsync(['list'], { from: 'user' });

      const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('No code reviews found');
    });

    it('should pass limit option', async () => {
      mockListExecute.mockResolvedValue([]);

      const cmd = createReviewCommand();
      await cmd.parseAsync(['list', '-n', '5'], { from: 'user' });

      expect(mockListExecute).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
    });

    it('should set exitCode 1 on list error', async () => {
      mockListExecute.mockRejectedValue(new Error('DB error'));

      const cmd = createReviewCommand();
      await cmd.parseAsync(['list'], { from: 'user' });

      expect(process.exitCode).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // post subcommand
  // -----------------------------------------------------------------------

  describe('post subcommand', () => {
    it('should post a review and show success', async () => {
      const review = makeReview({
        status: CodeReviewStatus.Posted,
        reviewUrl: 'https://github.com/octocat/my-project/pull/42#pullrequestreview-123',
      });
      mockPostExecute.mockResolvedValue(review);

      const cmd = createReviewCommand();
      await cmd.parseAsync(['post', 'a1b2c3d4'], { from: 'user' });

      expect(mockPostExecute).toHaveBeenCalledWith('a1b2c3d4');
      expect(process.exitCode).toBeUndefined();
    });

    it('should set exitCode 1 on post failure', async () => {
      mockPostExecute.mockRejectedValue(new Error('Cannot post review with status "Failed"'));

      const cmd = createReviewCommand();
      await cmd.parseAsync(['post', 'xyz'], { from: 'user' });

      expect(process.exitCode).toBe(1);
    });
  });
});
