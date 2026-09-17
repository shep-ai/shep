/**
 * PR-target resolution for the feature-agent merge step.
 *
 * Pure, total, non-throwing mapping (ADR-001): decides whether a pull request
 * should be created on the upstream repository (fork workflow) or on the
 * origin repository (default). All I/O (git remotes, gh fork-parent lookup)
 * stays in infrastructure; this module only maps injected values.
 *
 * Detection strategy (ADR-003, most-conservative-wins):
 *  1. Primary: explicit `upstream` git remote with a parseable GitHub URL.
 *  2. Secondary: GitHub fork-parent info (when the primary signal is absent).
 *  3. Fallback: any absence/ambiguity -> null (current origin behavior).
 */

export interface PrTarget {
  /** Where the PR is created, e.g. "shep-ai/shep". */
  targetRepo: string;
  /** Base branch on the target repository, e.g. "main". */
  baseBranch: string;
  /** Owner-qualified head ref, e.g. "kevinnguyenhoang91:fix/pr_upstream". */
  headRef: string;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface ForkParentInfo {
  owner: string;
  repo: string;
  /** Default branch of the upstream (parent) repository. */
  defaultBranch: string;
}

export interface PrTargetInputs {
  remotes: RemoteInfo[];
  /** null when the gh lookup is absent or failed (secondary signal unavailable). */
  forkParent: ForkParentInfo | null;
  /** Feature branch (head). */
  branch: string;
  /** Base to use when no upstream default branch is known. */
  fallbackBaseBranch: string;
}

/** Extract `owner/repo` from an SSH or HTTPS GitHub remote URL, else null. */
export function parseGithubOwnerRepo(url: string): { owner: string; repo: string } | null {
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(url.trim());
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  const https = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(url.trim());
  if (https) return { owner: https[1], repo: https[2] };
  return null;
}

/**
 * Resolve the PR target from injected inputs.
 * Returns null when the repo should keep current behavior (PR on origin).
 */
export function resolvePrTarget(inputs: PrTargetInputs): PrTarget | null {
  const origin = inputs.remotes.find((r) => r.name === 'origin');
  const originOwnerRepo = origin ? parseGithubOwnerRepo(origin.url) : null;
  // Head qualification requires a parseable origin (the user's fork).
  if (!originOwnerRepo) return null;
  const headRef = `${originOwnerRepo.owner}:${inputs.branch}`;

  // 1. Primary signal: explicit `upstream` remote.
  const upstream = inputs.remotes.find((r) => r.name === 'upstream');
  if (upstream && upstream.url.trim() !== '') {
    const upstreamOwnerRepo = parseGithubOwnerRepo(upstream.url);
    if (!upstreamOwnerRepo) return null; // ambiguity -> fallback (REQ-003)
    // Use forkParent's default branch only when it describes this upstream.
    const baseBranch =
      inputs.forkParent?.owner === upstreamOwnerRepo.owner &&
      inputs.forkParent.repo === upstreamOwnerRepo.repo
        ? inputs.forkParent.defaultBranch
        : inputs.fallbackBaseBranch;
    return {
      targetRepo: `${upstreamOwnerRepo.owner}/${upstreamOwnerRepo.repo}`,
      baseBranch,
      headRef,
    };
  }

  // 2. Secondary signal: GitHub fork-parent (no upstream remote configured).
  if (inputs.forkParent) {
    return {
      targetRepo: `${inputs.forkParent.owner}/${inputs.forkParent.repo}`,
      baseBranch: inputs.forkParent.defaultBranch,
      headRef,
    };
  }

  // 3. Fallback: plain repo (or unresolvable) -> current behavior.
  return null;
}
