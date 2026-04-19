/**
 * Platform Review Service Interface
 *
 * Output port for platform-specific code review operations.
 * The primary implementation uses GitHub (gh CLI), but the port
 * abstraction enables future GitLab support without changing use cases.
 */

import type { FileDiff } from './git-pr-service.interface.js';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/**
 * Thrown when a platform review operation fails.
 */
export class PlatformReviewError extends Error {
  constructor(
    message: string,
    public readonly code: PlatformReviewErrorCode,
    cause?: Error
  ) {
    super(message);
    this.name = 'PlatformReviewError';
    Object.setPrototypeOf(this, new.target.prototype);
    if (cause) this.cause = cause;
  }
}

/**
 * Error codes for platform review operations.
 */
export enum PlatformReviewErrorCode {
  /** GitHub CLI not found or not authenticated */
  AUTH_FAILURE = 'AUTH_FAILURE',
  /** PR not found */
  PR_NOT_FOUND = 'PR_NOT_FOUND',
  /** API rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Review submission failed (e.g. 422 validation error) */
  SUBMISSION_FAILED = 'SUBMISSION_FAILED',
  /** Network or transient error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Generic error */
  UNKNOWN = 'UNKNOWN',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * PR metadata returned by the platform.
 */
export interface PrMetadata {
  title: string;
  description: string;
  baseBranch: string;
  headBranch: string;
  commits: string[];
  owner: string;
  repo: string;
  prNumber: number;
  prUrl: string;
}

/**
 * An existing review comment already on the PR.
 */
export interface ExistingReviewComment {
  path: string;
  line: number;
  body: string;
  author: string;
}

/**
 * Inline comment to post as part of a review.
 */
export interface ReviewInlineComment {
  path: string;
  line: number;
  body: string;
  side: 'LEFT' | 'RIGHT';
  startLine?: number;
  startSide?: 'LEFT' | 'RIGHT';
}

/**
 * Result of posting a review.
 */
export interface PostReviewResult {
  /** URL of the posted review on the platform */
  reviewUrl: string;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

/**
 * Output port for platform-specific code review operations.
 *
 * Implementations handle:
 * - Fetching PR diffs via platform API
 * - Posting reviews with inline comments
 * - Fetching existing review comments (for dedup)
 * - Fetching PR metadata
 */
export interface IPlatformReviewService {
  /**
   * Fetch PR metadata (title, description, branches, commits).
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns PR metadata
   * @throws PlatformReviewError
   */
  fetchPrMetadata(owner: string, repo: string, prNumber: number): Promise<PrMetadata>;

  /**
   * Fetch PR diff as structured FileDiff[].
   * Uses the platform API to get per-file patches and parses them.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Array of per-file diffs
   * @throws PlatformReviewError
   */
  fetchPrDiff(owner: string, repo: string, prNumber: number): Promise<FileDiff[]>;

  /**
   * Post a review with inline comments to the platform.
   * Always uses COMMENT event (never APPROVE or REQUEST_CHANGES).
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @param body - Review summary body
   * @param comments - Inline comments with line + side parameters
   * @returns Result with the review URL
   * @throws PlatformReviewError
   */
  postReview(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    comments: ReviewInlineComment[]
  ): Promise<PostReviewResult>;

  /**
   * Fetch existing review comments on a PR for dedup.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Array of existing review comments
   * @throws PlatformReviewError
   */
  fetchExistingComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ExistingReviewComment[]>;
}
