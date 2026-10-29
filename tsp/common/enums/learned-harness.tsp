/**
 * @module Shep.Common.Enums.LearnedHarness
 *
 * Vocabulary of the self-learning harness (spec 150), adapted from Harness²
 * (google-research/harness2, Apache-2.0): the eight editable component kinds,
 * where a harness version came from and where it is in its life, the two
 * scoped edit dimensions, the verdict on what an edit did, and the user's
 * learning settings.
 */
@doc("Kind of component in a learned harness overlay")
enum HarnessComponentKind {
  @doc("Always-on role and procedure text")
  Instructions: "instructions",

  @doc("Always-on standing rules")
  Guardrails: "guardrails",

  @doc("Durable facts; persisted as Shep Brain project memory, not as a file")
  Memory: "memory",

  @doc("Always-on guidance on how to use the tools")
  ToolGuidance: "tool-guidance",

  @doc("An on-demand workflow loaded when its trigger fires")
  Skill: "skill",

  @doc("A deterministic helper script run on demand")
  Script: "script",

  @doc("A delegated agent with its own context")
  Subagent: "subagent",

  @doc("A lifecycle hook that acts inside the tool loop")
  Hook: "hook",
}

@doc("Lifecycle of a learned harness version")
enum LearnedHarnessStatus {
  @doc("Proposed and waiting for a decision")
  Candidate: "candidate",

  @doc("The scope's current harness")
  Adopted: "adopted",

  @doc("A person rejected the candidate")
  Rejected: "rejected",

  @doc("Was adopted, then rolled back to its parent")
  RolledBack: "rolled-back",

  @doc("Was adopted, then replaced by a newer adopted version")
  Superseded: "superseded",
}

@doc("How a learned harness version was produced")
enum HarnessOrigin {
  @doc("The empty starting overlay")
  Base: "base",

  @doc("Reflection on a finished run (no probes)")
  Reflect: "reflect",

  @doc("Propose-Probe-Compose with probe executions")
  Explore: "explore",

  @doc("Written or imported by a person")
  Manual: "manual",
}

@doc("Which scoped editor produced a harness edit")
enum HarnessEditDimension {
  @doc("How the agent works: procedure, tools, completion")
  Inv: "inv",

  @doc("What a practitioner of this repository knows")
  Dom: "dom",

  @doc("The composer that merged the candidates")
  Compose: "compose",
}

@doc("What an edit to a harness component was observed to do")
enum HarnessEditVerdict {
  @doc("An execution contrast shows it improved behaviour")
  Helped: "helped",

  @doc("An execution contrast shows it made behaviour worse")
  Hurt: "hurt",

  @doc("Executions show no difference")
  NoObservedEffect: "no-observed-effect",

  @doc("Several changes or a single execution stand behind the difference")
  Confounded: "confounded",

  @doc("Never executed: proposed by reflection without a probe")
  Untested: "untested",
}

@doc("How strongly the evidence supports a lesson")
enum LessonConfidence {
  High: "high",
  Medium: "medium",
  Low: "low",
}

@doc("How Shep learns from feature runs")
enum LearningMode {
  @doc("No learning; no reflection, no exploration")
  Off: "off",

  @doc("Reflect on each finished run and propose a candidate harness")
  Reflect: "reflect",

  @doc("Reflect, and run Propose-Probe-Compose on the implement phase")
  Explore: "explore",
}

@doc("When a candidate harness is adopted without a person")
enum HarnessAdoptionPolicy {
  @doc("Every candidate waits for a person")
  Manual: "manual",

  @doc("Explore candidates touching only text components are adopted automatically")
  AutoTextOnly: "auto-text-only",

  @doc("Candidates without scripts or hooks are adopted automatically")
  Auto: "auto",
}

@doc("How task-level recursion spends its budget")
enum HarnessRecursion {
  @doc("Explore wider: k candidates per dimension, k compositions")
  Parallel: "parallel",

  @doc("Refine deeper: k successive propose-probe-compose rounds")
  Sequential: "sequential",
}

@doc("What became of one harness refinement")
enum HarnessRefinementStatus {
  @doc("Still running")
  Running: "running",

  @doc("Produced a candidate version")
  Proposed: "proposed",

  @doc("The evidence argued for no change")
  KeptBase: "kept-base",

  @doc("Every proposal failed validation; the current harness was inherited")
  FellBack: "fell-back",

  @doc("Stopped at the cost cap; the base result was used")
  OverBudget: "over-budget",

  @doc("Failed; the feature run was unaffected")
  Failed: "failed",
}

@doc("Where an agent family reads harness components from")
enum HarnessSurfaceFamily {
  @doc("Claude Code: appended system prompt, .claude/skills, .claude/agents, hooks")
  ClaudeCode: "claude-code",

  @doc("Codex: .agents/skills, always-on text in the prompt")
  Codex: "codex",

  @doc("Any other agent: always-on text and a skill index as a prompt section")
  PromptSection: "prompt-section",
}

@doc("How a harness version's outcomes compare with its parent's")
enum HarnessVersionTrend {
  @doc("Too few features on one side to judge")
  InsufficientData: "insufficient-data",

  @doc("Outcomes are better than the parent's beyond the tolerance")
  Improved: "improved",

  @doc("Outcomes are within the tolerance of the parent's")
  Unchanged: "unchanged",

  @doc("Outcomes are worse than the parent's beyond the tolerance")
  Regressed: "regressed",
}

@doc("How always-on harness text reaches an agent")
enum HarnessAlwaysOnChannel {
  @doc("Appended to the agent's system prompt")
  SystemPrompt: "system-prompt",

  @doc("Rendered as a section of the task prompt")
  Prompt: "prompt",
}

@doc("What the static scan of a candidate harness flagged")
enum HarnessScanRule {
  @doc("Looks like a credential or private key")
  Secret: "secret",

  @doc("Reaches the network")
  Network: "network",

  @doc("Destroys data or rewrites history")
  Destructive: "destructive",

  @doc("Writes outside the feature worktree")
  OutsideWorktree: "outside-worktree",
}
