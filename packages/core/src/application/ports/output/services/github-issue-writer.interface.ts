/**
 * GitHub Issue Writer Port
 *
 * Output port for issue-level mutations (label, comment, assign) on GitHub.
 * Read-side concerns live in `IGitHubRepositoryService` and
 * `IExternalIssueFetcher`; this port is the single chokepoint for writes so
 * every mutation can be funnelled through the spec-093 supervisor approval
 * gate (NFR-5).
 *
 * Implementations MUST reuse the GitHub credentials already discovered by the
 * existing GitHub-integration code path (e.g. `gh auth token` resolution) —
 * no new auth flow, no new token storage (NFR-10).
 */

/**
 * Reference to a single GitHub issue.
 *
 * Typed object (not a stringly-typed `owner/repo#n`) so callers cannot pass
 * unparsed user input directly into HTTP path segments.
 */
export interface IssueRef {
  /** Repository owner login (e.g. "shep-ai"). */
  owner: string;
  /** Repository name (e.g. "shep"). */
  repo: string;
  /** Issue or pull-request number — both share the same number space on GitHub. */
  issueNumber: number;
}

/**
 * Output port for GitHub issue mutations.
 */
export interface IGitHubIssueWriter {
  /**
   * Append labels to an issue. Existing labels are preserved.
   * @throws on transport failure or insufficient token scope.
   */
  addLabels(ref: IssueRef, labels: readonly string[]): Promise<void>;

  /**
   * Remove labels from an issue. Removing a label that is not present is a no-op.
   * @throws on transport failure or insufficient token scope.
   */
  removeLabels(ref: IssueRef, labels: readonly string[]): Promise<void>;

  /**
   * Post a new comment on an issue. Body is rendered with GitHub-flavored markdown.
   * @throws on transport failure or insufficient token scope.
   */
  addComment(ref: IssueRef, body: string): Promise<void>;

  /**
   * Assign GitHub users to an issue. Existing assignees are preserved.
   * @throws on transport failure or insufficient token scope.
   */
  assignUsers(ref: IssueRef, logins: readonly string[]): Promise<void>;
}

/**
 * Base error for all `IGitHubIssueWriter` failures. Concrete adapters wrap
 * transport errors in this so callers can distinguish writer failures from
 * domain failures without leaking SDK types into the application layer.
 */
export class GitHubIssueWriterError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'GitHubIssueWriterError';
    Object.setPrototypeOf(this, new.target.prototype);
    if (cause) this.cause = cause;
  }
}
