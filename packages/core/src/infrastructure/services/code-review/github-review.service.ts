/**
 * GitHub Review Service
 *
 * Implements IPlatformReviewService using the gh CLI (gh api) for all
 * GitHub API interactions. Uses modern line + side parameters (not
 * deprecated position) for inline comments.
 *
 * Includes retry logic with exponential backoff for transient errors.
 */

import { injectable, inject } from 'tsyringe';
import type { ExecFunction } from '../git/worktree.service.js';
import type {
  IPlatformReviewService,
  PrMetadata,
  ExistingReviewComment,
  ReviewInlineComment,
  PostReviewResult,
} from '../../../application/ports/output/services/platform-review-service.interface.js';
import {
  PlatformReviewError,
  PlatformReviewErrorCode,
} from '../../../application/ports/output/services/platform-review-service.interface.js';
import type {
  FileDiff,
  DiffHunk,
  DiffLine,
} from '../../../application/ports/output/services/git-pr-service.interface.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is a retryable HTTP error based on status code.
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return RETRYABLE_STATUS_CODES.some((code) => message.includes(`${code}`));
}

/**
 * Classify error into PlatformReviewErrorCode.
 */
function classifyError(error: unknown): PlatformReviewErrorCode {
  if (!(error instanceof Error)) return PlatformReviewErrorCode.UNKNOWN;
  const msg = error.message;
  if (msg.includes('404') || msg.includes('Not Found')) return PlatformReviewErrorCode.PR_NOT_FOUND;
  if (msg.includes('401') || msg.includes('403') || msg.includes('auth'))
    return PlatformReviewErrorCode.AUTH_FAILURE;
  if (msg.includes('429') || msg.includes('rate limit'))
    return PlatformReviewErrorCode.RATE_LIMITED;
  if (msg.includes('422') || msg.includes('Validation'))
    return PlatformReviewErrorCode.SUBMISSION_FAILED;
  if (RETRYABLE_STATUS_CODES.some((code) => msg.includes(`${code}`)))
    return PlatformReviewErrorCode.NETWORK_ERROR;
  return PlatformReviewErrorCode.UNKNOWN;
}

/**
 * Parse a GitHub API patch string into DiffHunk[]/DiffLine[] structures.
 * Reuses the same parsing logic as GitPrService.parseUnifiedDiff.
 */
function parsePatch(patch: string): {
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
} {
  if (!patch?.trim()) {
    return { hunks: [], additions: 0, deletions: 0 };
  }

  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;
  let additions = 0;
  let deletions = 0;

  for (const line of patch.split('\n')) {
    const hunkHeaderMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/);
    if (hunkHeaderMatch) {
      currentHunk = { header: line, lines: [] };
      hunks.push(currentHunk);
      oldLineNum = parseInt(hunkHeaderMatch[1], 10);
      newLineNum = parseInt(hunkHeaderMatch[2], 10);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      const diffLine: DiffLine = {
        type: 'added',
        content: line.slice(1),
        newNumber: newLineNum,
      };
      currentHunk.lines.push(diffLine);
      newLineNum++;
      additions++;
    } else if (line.startsWith('-')) {
      const diffLine: DiffLine = {
        type: 'removed',
        content: line.slice(1),
        oldNumber: oldLineNum,
      };
      currentHunk.lines.push(diffLine);
      oldLineNum++;
      deletions++;
    } else if (line.startsWith(' ')) {
      const diffLine: DiffLine = {
        type: 'context',
        content: line.slice(1),
        oldNumber: oldLineNum,
        newNumber: newLineNum,
      };
      currentHunk.lines.push(diffLine);
      oldLineNum++;
      newLineNum++;
    }
    // Skip lines like "\ No newline at end of file"
  }

  return { hunks, additions, deletions };
}

/**
 * Format a suggestion as a GitHub suggestion block for the review body.
 */
export function formatSuggestion(suggestion: string): string {
  return `\`\`\`suggestion\n${suggestion}\n\`\`\``;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@injectable()
export class GitHubReviewService implements IPlatformReviewService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async fetchPrMetadata(owner: string, repo: string, prNumber: number): Promise<PrMetadata> {
    const result = await this.ghApi<{
      title: string;
      body: string;
      base: { ref: string };
      head: { ref: string };
      html_url: string;
      commits: number;
    }>('GET', `/repos/${owner}/${repo}/pulls/${prNumber}`);

    // Fetch commit messages
    const commits = await this.fetchCommitMessages(owner, repo, prNumber);

    return {
      title: result.title,
      description: result.body ?? '',
      baseBranch: result.base.ref,
      headBranch: result.head.ref,
      commits,
      owner,
      repo,
      prNumber,
      prUrl: result.html_url,
    };
  }

  async fetchPrDiff(owner: string, repo: string, prNumber: number): Promise<FileDiff[]> {
    // GitHub API paginates at 100 files per page, max 3000 files
    const allFiles: FileDiff[] = [];
    let page = 1;

    while (true) {
      const files = await this.ghApi<
        {
          filename: string;
          status: string;
          additions: number;
          deletions: number;
          patch?: string;
          previous_filename?: string;
        }[]
      >('GET', `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`);

      if (files.length === 0) break;

      for (const file of files) {
        const status = this.mapGitHubFileStatus(file.status);
        const { hunks, additions, deletions } = parsePatch(file.patch ?? '');

        allFiles.push({
          path: file.filename,
          oldPath: file.previous_filename,
          additions: file.additions ?? additions,
          deletions: file.deletions ?? deletions,
          status,
          hunks,
        });
      }

      if (files.length < 100) break;
      page++;
    }

    return allFiles;
  }

  async postReview(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    comments: ReviewInlineComment[]
  ): Promise<PostReviewResult> {
    const reviewPayload: Record<string, unknown> = {
      body,
      event: 'COMMENT',
      comments: comments.map((c) => {
        const comment: Record<string, unknown> = {
          path: c.path,
          line: c.line,
          body: c.body,
          side: c.side,
        };
        if (c.startLine !== undefined) {
          comment.start_line = c.startLine;
          comment.start_side = c.startSide ?? c.side;
        }
        return comment;
      }),
    };

    const result = await this.ghApi<{ html_url: string }>(
      'POST',
      `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
      reviewPayload
    );

    return { reviewUrl: result.html_url };
  }

  async fetchExistingComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ExistingReviewComment[]> {
    const comments = await this.ghApi<
      {
        path: string;
        line: number | null;
        original_line: number | null;
        body: string;
        user: { login: string };
      }[]
    >('GET', `/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100`);

    return comments
      .filter((c) => (c.line ?? c.original_line) !== null)
      .map((c) => ({
        path: c.path,
        line: c.line ?? c.original_line ?? 0,
        body: c.body,
        author: c.user.login,
      }));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Execute a GitHub API request via gh api with retry logic.
   */
  private async ghApi<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const args = ['api', endpoint, '--method', method];

        if (body) {
          args.push('--input', '-');
        }

        const options: Record<string, unknown> = {};
        if (body) {
          options.input = JSON.stringify(body);
        }

        const { stdout } = await this.execFile('gh', args, options);
        return JSON.parse(stdout) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (isRetryableError(error) && attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }

        break;
      }
    }

    const code = classifyError(lastError);
    throw new PlatformReviewError(
      `GitHub API ${method} ${endpoint} failed: ${lastError?.message ?? 'Unknown error'}`,
      code,
      lastError
    );
  }

  /**
   * Fetch commit messages for a PR.
   */
  private async fetchCommitMessages(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<string[]> {
    try {
      const commits = await this.ghApi<{ commit: { message: string } }[]>(
        'GET',
        `/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=100`
      );
      return commits.map((c) => c.commit.message.split('\n')[0]);
    } catch {
      // Non-critical — return empty array if commit fetch fails
      return [];
    }
  }

  /**
   * Map GitHub file status string to FileDiff status.
   */
  private mapGitHubFileStatus(status: string): FileDiff['status'] {
    switch (status) {
      case 'added':
        return 'added';
      case 'removed':
        return 'deleted';
      case 'renamed':
        return 'renamed';
      default:
        return 'modified';
    }
  }
}
