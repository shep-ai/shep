/**
 * @module Shep.Domain.Entities.Contributor
 *
 * Defines the Contributor entity — an external OSS contributor to a repository
 * that Shep is helping run. Distinct from `PmUser` (internal stakeholders) so
 * the two concerns can evolve independently.
 *
 * Populated by:
 *  - `welcome-first-time-contributor.use-case.ts` on first PR open.
 *  - `award-recognition.use-case.ts` on PR merge (bumps `prCount` and
 *    crosses-thresholds may promote `level`).
 *
 * ## Invariants
 *  - `githubLogin` is unique across all contributors.
 *  - `level` strictly progresses User → Contributor → Core → Maintainer.
 *  - `prCount` is monotonically non-decreasing.
 *  - `firstContributionAt` and `lastContributionAt` bracket the contributor's
 *    activity window; `lastContributionAt >= firstContributionAt` always.
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../value-objects/contributor-lane.tsp";
import "../value-objects/contributor-level.tsp";

@doc("External OSS contributor to a repository Shep is helping run")
model Contributor extends BaseEntity {
  @doc("GitHub login (e.g., 'octocat') — unique across contributors")
  githubLogin: string;

  @doc("Display name — public profile name on GitHub if available")
  displayName?: string;

  @doc("Avatar URL from GitHub's public profile")
  avatarUrl?: string;

  @doc("Primary lane the contributor works in (set by classify-into-lane or manually)")
  lane?: ContributorLane;

  @doc("Position on the contributor ladder")
  level: ContributorLevel;

  @doc("ISO timestamp of the contributor's first interaction (first PR or issue)")
  firstContributionAt: utcDateTime;

  @doc("ISO timestamp of the contributor's most recent interaction")
  lastContributionAt: utcDateTime;

  @doc("Number of merged PRs authored by this contributor in this repository")
  prCount: int32;

  @doc("Number of accepted issues opened by this contributor in this repository")
  issueCount: int32;
}
