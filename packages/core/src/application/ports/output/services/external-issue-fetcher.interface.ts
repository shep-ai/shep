/**
 * External Issue Fetcher Port Interface
 *
 * Output port for fetching issues/tickets from external systems (GitHub, Jira).
 * Returns a normalized ExternalIssue that can be appended to feature context.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides concrete implementations
 */

/**
 * Normalized issue representation from any external source.
 */
export interface ExternalIssue {
  title: string;
  description: string;
  labels: string[];
  url: string;
  source: 'github' | 'jira';
}

/**
 * Lightweight summary of a GitHub issue used by listing endpoints (stale
 * detection, curated issue queries). Avoids returning full body text when
 * the caller only needs metadata.
 */
export interface ExternalIssueSummary {
  /** Repository owner login. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Issue number. */
  issueNumber: number;
  /** Issue title. */
  title: string;
  /** All labels currently applied to the issue. */
  labels: readonly string[];
  /** ISO 8601 timestamp of the last activity (comment or update) on the issue. */
  lastActivityAt: string;
  /** Public URL to the issue. */
  url: string;
}

/**
 * Service interface for fetching issues from external systems.
 */
export interface IExternalIssueFetcher {
  /**
   * Fetch a GitHub issue by reference.
   * Supports formats: owner/repo#123 or #123 (uses current repo).
   *
   * @param ref - GitHub issue reference (e.g., "owner/repo#42" or "#42")
   * @returns Normalized external issue
   * @throws IssueNotFoundError if issue doesn't exist
   * @throws IssueServiceUnavailableError if gh CLI is not installed
   */
  fetchGitHubIssue(ref: string): Promise<ExternalIssue>;

  /**
   * Fetch a Jira ticket by key.
   *
   * @param key - Jira ticket key (e.g., "PROJ-123")
   * @returns Normalized external issue
   * @throws IssueNotFoundError if ticket doesn't exist
   * @throws IssueAuthenticationError if credentials are invalid
   */
  fetchJiraTicket(key: string): Promise<ExternalIssue>;

  /**
   * Count the number of merged pull requests authored by the given login
   * in the given repository. Used by `welcome-first-time-contributor` to
   * decide whether the PR opener is a first-time contributor.
   *
   * @param owner - Repository owner login
   * @param repo - Repository name
   * @param login - GitHub login of the PR author
   */
  getMergedPrCount(owner: string, repo: string, login: string): Promise<number>;

  /**
   * List GitHub issues in a repository that carry the given label. Closed
   * issues are excluded by default.
   */
  listIssuesByLabel(owner: string, repo: string, label: string): Promise<ExternalIssueSummary[]>;

  /**
   * List GitHub issues in a repository that carry ALL of the given labels
   * (intersection). Closed issues are excluded by default.
   */
  listIssuesByLabels(
    owner: string,
    repo: string,
    labels: readonly string[]
  ): Promise<ExternalIssueSummary[]>;
}

/**
 * Base error for issue fetcher failures.
 */
export class IssueFetcherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IssueFetcherError';
  }
}

/**
 * Thrown when the requested issue/ticket is not found.
 */
export class IssueNotFoundError extends IssueFetcherError {
  constructor(message: string) {
    super(message);
    this.name = 'IssueNotFoundError';
  }
}

/**
 * Thrown when authentication to the external service fails.
 */
export class IssueAuthenticationError extends IssueFetcherError {
  constructor(message: string) {
    super(message);
    this.name = 'IssueAuthenticationError';
  }
}

/**
 * Thrown when the external service is unavailable (e.g., gh CLI not installed).
 */
export class IssueServiceUnavailableError extends IssueFetcherError {
  constructor(message: string) {
    super(message);
    this.name = 'IssueServiceUnavailableError';
  }
}
