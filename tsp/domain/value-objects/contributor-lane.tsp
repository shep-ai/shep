/**
 * @module Shep.Domain.ValueObjects.ContributorLane
 *
 * Lane classification for OSS contributor work — Shep-named lanes that map to
 * the actual code areas of the project (resolved spec product-question 11).
 *
 * Used by:
 *  - `IntakeItem` / GitHub issue grooming to label which area an issue belongs to.
 *  - `Contributor` to record the contributor's primary lane of work.
 *  - The web onboarding lane chooser (the dropdown in `/onboarding`).
 *  - The contributor leaderboard for per-lane recognition.
 *
 * Naming rationale: contributors should not have to learn a coordinate system
 * (letter labels were rejected in the brainstorm). The lane name itself maps
 * directly to a directory-area in the repo, so a contributor reading a label
 * already knows where they're going.
 */
/**
 * Contributor Lane
 *
 * Five buckets corresponding to the major areas of the Shep codebase.
 */
@doc("Contributor lane — area of the codebase a contribution belongs to")
enum ContributorLane {
  @doc("Documentation, READMEs, guides, contributor onboarding copy")
  Docs: "docs",

  @doc("AI agents, prompts, agent graphs, supervisor and intake automation")
  Agents: "agents",

  @doc("Web dashboard, React components, Storybook, Playwright e2e")
  Ui: "ui",

  @doc("CLI commands, TUI surfaces, Commander wiring")
  Cli: "cli",

  @doc("Infrastructure: persistence, migrations, DI, build/CI, deployment")
  Infra: "infra",
}
