/**
 * @module Shep.Common.Enums.BuildMode
 *
 * Defines the BuildMode enum representing how a feature run is executed.
 *
 * BuildMode is a domain concept that controls the SDLC pipeline a feature
 * progresses through:
 *
 *  - `application` runs the standard, full SDLC for application-mode work.
 *  - `fast` skips spec / planning phases and implements directly from the
 *    user prompt.
 *  - `spec` runs the full spec-driven (SDD) pipeline, typically scoped to
 *    an existing Application via `Feature.applicationId`.
 *  - `exploration` runs iterative prototyping with a feedback loop before
 *    committing to full implementation.
 *
 * Lowercase string values are deliberate: they match the existing UI
 * `BuildMode` union and the existing `?mode=` URL param scheme, so
 * persisted rows, in-flight URL params, and stored payloads remain
 * wire-compatible after migration.
 */
@doc("How a feature run is executed (controls which SDLC pipeline it follows)")
enum BuildMode {
  /**
   * Application mode — the default. Runs the full SDLC pipeline against
   * the feature's repository.
   */
  @doc("Standard application-mode run through the full SDLC pipeline")
  Application: "application",

  /**
   * Fast mode — skips spec / planning phases and implements directly
   * from the user prompt. Used when the user wants to ship a small
   * change without the structured SDLC ceremony.
   */
  @doc("Skip spec/planning and implement directly from the prompt")
  Fast: "fast",

  /**
   * Spec-driven (SDD) mode — runs the full spec-driven pipeline.
   * Typically scoped to an existing Application via
   * `Feature.applicationId`, but may also be launched stand-alone.
   */
  @doc("Spec-driven (SDD) run, typically scoped to an existing Application")
  Spec: "spec",

  /**
   * Exploration mode — iterative prototyping with a feedback loop.
   * The agent generates quick prototypes, interrupts for user feedback,
   * and iterates until the user promotes to a full feature or discards.
   */
  @doc("Iterative prototyping with feedback loop before committing to implementation")
  Exploration: "exploration",
}
