/**
 * @module Shep.Domain.ValueObjects.ContributionDifficulty
 *
 * Difficulty classification for contribution opportunities (issues curated as
 * good-first-issue and beyond). Drives the issue-template dropdown, the
 * `GOOD_FIRST_ISSUES.md` grouping, and the curated-issues filter on the web
 * onboarding page.
 */
/**
 * Contribution Difficulty
 *
 * Four levels from "fits a brand-new contributor" to "deep platform work".
 */
@doc("Contribution difficulty — how much project context the contributor needs")
enum ContributionDifficulty {
  @doc("Curated good-first-issue — minimal context required")
  GoodFirst: "goodFirst",

  @doc("Easy — small surface area, clear acceptance criteria")
  Easy: "easy",

  @doc("Medium — multiple files or moderate domain knowledge")
  Medium: "medium",

  @doc("Hard — cross-cutting changes or deep platform knowledge required")
  Hard: "hard",
}
