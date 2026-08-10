/**
 * @module Shep.Common.Enums.TaskComplexity
 *
 * Defines the TaskComplexity enum used by adaptive model selection.
 *
 * The planning phase labels every task in `tasks.yaml` with a complexity, and
 * the implement node routes each task to the model tier that matches it. The
 * three values are deliberately coarse — a finer scale would not map onto the
 * flagship / mid / small tiers that model vendors actually ship.
 *
 * Complexity is a property of the WORK, and tier is a property of the MODEL.
 * They share this enum because the mapping between them is the identity: a
 * High-complexity task asks for a high-tier model. Keeping one enum means
 * there is exactly one vocabulary to normalize legacy or LLM-authored
 * spellings into (see `domain/shared/model-tier.ts`).
 *
 * Capitalized string values match the other spec-artifact enums (`TaskState`,
 * `SdlcLifecycle`) that are written into and read back out of YAML spec files.
 */
@doc("How much reasoning capability a unit of work requires, and equivalently the model tier that serves it")
enum TaskComplexity {
  /**
   * Novel design, cross-cutting refactors, subtle concurrency or security
   * work, anything where getting it wrong is expensive to detect. Served by
   * the most capable model the run is allowed to use.
   */
  @doc("Novel design or cross-cutting work — needs the most capable available model")
  High: "High",

  /**
   * Ordinary feature work that follows an established pattern in the codebase
   * but still requires judgement about where code belongs and how it composes.
   */
  @doc("Ordinary feature work following an established pattern — mid-tier model")
  Medium: "Medium",

  /**
   * Mechanical, well-specified edits: adding a key to every locale file,
   * extending an enum list, adding a column to a SQL statement, writing a
   * story for an existing component.
   */
  @doc("Mechanical, well-specified edits — small/fast model is sufficient")
  Low: "Low",
}
