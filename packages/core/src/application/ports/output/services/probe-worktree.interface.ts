/**
 * Probe Worktrees (Output Port, spec 150 — Explore mode)
 *
 * Sibling git worktrees forked from the feature's pre-implement commit, one
 * per probe, so several harnesses can implement the same feature from the
 * same starting point. After a rollout the service commits what the agent
 * left, diffs it against the start, and runs the repository's own checks.
 * The chosen probe's commits are fast-forwarded into the feature worktree.
 */

export interface ProbeWorktree {
  label: string;
  /** Absolute path of the probe worktree. */
  path: string;
  /** Commit every probe starts from. */
  baseCommit: string;
}

export interface ProbeCheckResult {
  command: string;
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  /** Output tail. */
  output: string;
}

export interface ProbeOutcome {
  label: string;
  /** Unified diff against the base commit (learned-harness files excluded). */
  diff: string;
  /** `git diff --stat` against the base commit. */
  diffStat: string;
  /** The probe changed something. */
  delivered: boolean;
  checks: ProbeCheckResult[];
}

export interface IProbeWorktreeService {
  /** The commit the feature worktree is at now — every probe forks from it. */
  headCommit(featureWorktree: string): Promise<string>;

  fork(featureWorktree: string, baseCommit: string, label: string): Promise<ProbeWorktree>;

  /** Commit leftovers, diff against the base and run the checks. */
  inspect(probe: ProbeWorktree): Promise<ProbeOutcome>;

  /** Fast-forward the feature worktree to the probe's commits. */
  adopt(probe: ProbeWorktree, featureWorktree: string): Promise<void>;

  /** Remove the probe worktree. Never throws. */
  dispose(probe: ProbeWorktree): Promise<void>;
}
