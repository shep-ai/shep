/**
 * @module Shep.Common.Enums.Telemetry
 *
 * Enums for opt-out usage metrics (spec 133). Event names are an enum so no
 * component compares or emits a raw event string.
 */
/**
 * Usage events Shep records. Values are the event names sent to the
 * analytics backend. None of them carries prompts, code, paths, repository or
 * branch names, feature titles or error messages.
 */
@doc("Usage event recorded by Shep's opt-out telemetry")
enum TelemetryEvent {
  @doc("Once a day per install: version, platform, configured agent, counts")
  InstallHeartbeat: "install.heartbeat",

  @doc("A CLI command ran (command path only, never arguments)")
  CliCommand: "cli.command",

  @doc("A web area was viewed (route template, never ids)")
  WebAreaViewed: "web.area.viewed",

  @doc("A feature was created")
  FeatureCreated: "feature.created",

  @doc("A feature agent run reached a terminal status")
  FeatureRunFinished: "feature.run.finished",

  @doc("A pull request was opened for a feature")
  PrOpened: "pr.opened",

  @doc("A feature's pull request was merged")
  PrMerged: "pr.merged",

  @doc("A user answered an agent decision (emitted by the unified-decisions work)")
  DecisionAnswered: "decision.answered",

  @doc("A web onboarding step was shown or completed")
  OnboardingStep: "onboarding.step",

  @doc("An unhandled error: error class and a hash of its source frame, no message")
  ErrorUnhandled: "error.unhandled",
}

/**
 * Why telemetry is off. Environment reasons take precedence over the user's
 * own choice.
 */
@doc("Reason telemetry is disabled")
enum TelemetryDisabledReason {
  @doc("The CI environment variable is set")
  Ci: "ci",

  @doc("DO_NOT_TRACK is set")
  DoNotTrack: "do-not-track",

  @doc("SHEP_TELEMETRY_DISABLED is set")
  EnvDisabled: "env-disabled",

  @doc("Running under a test runner")
  Test: "test",

  @doc("The user turned telemetry off")
  UserOptOut: "user-opt-out",
}

/**
 * The kind of Shep process that recorded an event.
 */
@doc("Process that recorded a telemetry event")
enum TelemetryProcessKind {
  @doc("A CLI invocation")
  Cli: "cli",

  @doc("The background daemon (also serves the web UI)")
  Daemon: "daemon",

  @doc("A feature-agent worker")
  Worker: "worker",
}

/**
 * Web onboarding steps reported by the onboarding.step event.
 */
@doc("Web onboarding step")
enum OnboardingStep {
  @doc("Agent selection and setup")
  AgentSetup: "agent-setup",

  @doc("The add-a-project screen")
  AddProject: "add-project",

  @doc("A project folder was added")
  ProjectAdded: "project-added",

  @doc("The user started from a prompt")
  StartFromPrompt: "start-from-prompt",

  @doc("The telemetry notice")
  TelemetryNotice: "telemetry-notice",
}
