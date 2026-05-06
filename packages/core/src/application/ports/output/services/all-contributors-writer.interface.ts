/**
 * All Contributors Writer Port
 *
 * Output port that owns the `.all-contributorsrc` JSON file at the workspace
 * root and the corresponding `<!-- ALL-CONTRIBUTORS-LIST:START -->` block in
 * `README.md`. The in-house implementation rewrites both files directly so
 * the contributor pipeline stays self-contained — no upstream
 * `@all-contributors` GitHub App, no `all-contributors-cli` runtime
 * dependency (resolved spec product-question 6).
 *
 * Implementations MUST be idempotent: reapplying the same
 * `(login, contributions)` triple is a no-op (NFR-11).
 */

/**
 * A single contribution category as defined by the all-contributors emoji
 * key. Stored as a string so adapters can support custom categories without
 * needing to extend a TypeScript enum every time, but the port-level type
 * documents the canonical set.
 *
 * @see https://allcontributors.org/docs/en/emoji-key
 */
export type AllContributorsContributionKind =
  | 'code'
  | 'doc'
  | 'review'
  | 'bug'
  | 'design'
  | 'ideas'
  | 'infra'
  | 'maintenance'
  | 'test'
  | 'tutorial'
  | 'translation'
  | 'question'
  | 'plugin'
  | 'platform'
  | 'mentoring'
  | 'projectManagement'
  | 'content'
  | 'data'
  | 'example'
  | 'eventOrganizing'
  | 'financial'
  | 'fundingFinding'
  | 'security'
  | 'tool'
  | 'userTesting'
  | 'video'
  | string;

/**
 * Input for `IAllContributorsWriter.appendContributor`.
 */
export interface AppendContributorInput {
  /** GitHub login (case-insensitive match against existing entries). */
  login: string;
  /** Contribution categories to associate with the contributor. */
  contributions: readonly AllContributorsContributionKind[];
  /** Public display name (defaults to `login` when omitted). */
  name?: string;
  /** Avatar URL (defaults to GitHub's avatar URL when omitted). */
  avatarUrl?: string;
  /** Profile URL (defaults to `https://github.com/{login}` when omitted). */
  profile?: string;
}

/**
 * Output port for the all-contributors file pair.
 */
export interface IAllContributorsWriter {
  /**
   * Upsert a contributor entry in `.all-contributorsrc` and re-render the
   * README contributors block.
   *
   * Behavior:
   *   - If `login` is not present, append a new entry with the given
   *     contributions.
   *   - If `login` is present, union the new contributions into the existing
   *     contributions list (deduplicated, deterministic order).
   *   - In both cases, regenerate the README block between the
   *     `<!-- ALL-CONTRIBUTORS-LIST:START -->` and `:END -->` markers.
   *     Content outside those markers is never touched.
   *   - Idempotent: same input twice produces no diff on the second call.
   *
   * @throws when the workspace root cannot be located, when
   *   `.all-contributorsrc` is malformed JSON, or when the README markers
   *   are missing and cannot be inserted safely.
   */
  appendContributor(input: AppendContributorInput): Promise<void>;
}

/**
 * Base error for all-contributors writer failures.
 */
export class AllContributorsWriterError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'AllContributorsWriterError';
    Object.setPrototypeOf(this, new.target.prototype);
    if (cause) this.cause = cause;
  }
}
