/**
 * IGitOwnershipPort (Phase 11, task-69).
 *
 * Resolves authorship of a file in a git working tree to an email address.
 * Implementations use `git log --pretty=format:%ae --follow` to walk
 * historical authors, plus optional CODEOWNERS fallback when blame data is
 * insufficient.
 *
 * The pure-domain ownership resolver still wins: explicit .shep/ownership.yaml
 * entries always beat anything this port returns.
 */

export interface GitOwnerCandidate {
  /** Author email address (lower-cased). */
  email: string;
  /** Number of commits touching the path attributed to this author. */
  commitCount: number;
}

export interface GitOwnerLookupInput {
  /** Absolute path to the repo root. */
  repoRoot: string;
  /** Repo-relative POSIX path of the file/asset to attribute. */
  assetPath: string;
}

export interface IGitOwnershipPort {
  /**
   * Returns authors ordered by descending commit count. Empty array when the
   * path is not tracked, the repo is not a git repo, or git is unavailable.
   */
  lookup(input: GitOwnerLookupInput): Promise<GitOwnerCandidate[]>;
}
