/**
 * @module Shep.Domain.ValueObjects.ContributorLevel
 *
 * Contributor ladder used by `CONTRIBUTING.md`, the leaderboard, and the
 * `award-recognition` use case to determine when a contributor's level should
 * be promoted on PR merge.
 *
 * The ladder progresses strictly left-to-right; promotion criteria are
 * documented in `CONTRIBUTING.md` and enforced in
 * `application/use-cases/contributors/award-recognition.use-case.ts`.
 */
/**
 * Contributor Level
 *
 * Four-step ladder from first-time visitor to project maintainer.
 */
@doc("Contributor level — position on the User → Maintainer ladder")
enum ContributorLevel {
  @doc("Has interacted with the project but not yet contributed")
  User: "user",

  @doc("Has shipped at least one merged PR")
  Contributor: "contributor",

  @doc("Trusted contributor with sustained, high-quality contributions")
  Core: "core",

  @doc("Project maintainer — full review and merge authority")
  Maintainer: "maintainer",
}
