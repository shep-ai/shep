/**
 * @module Shep.Agents.AgentQuestion
 *
 * Unified question/escalation surface that bridges the SDK V2
 * `AskUserQuestion` (interactive) path and background-agent approval
 * gates. Every question — regardless of mode — surfaces in the same
 * inbox.
 *
 * @see specs/093-agent-collaboration-supervision/research.yaml
 */
import "../common/base.tsp";
import "./decision.tsp";

/**
 * Agent Question Kind
 *
 * Three-tier urgency model. Maps cleanly to existing approval-gate
 * semantics (blocking) and SSE notifications (info / question).
 *
 * | Value     | Description                                                       |
 * |-----------|-------------------------------------------------------------------|
 * | info      | FYI, no response needed — streams to activity feed only           |
 * | question  | Answer when convenient; default may auto-resolve on timeout       |
 * | blocking  | Agent is paused; MUST be answered to continue                     |
 */
@doc("Three-tier urgency for an agent question")
enum AgentQuestionKind {
  @doc("Informational — streams to activity feed, no response needed")
  info: "info",

  @doc("Answer when convenient; may auto-resolve on timeout")
  question: "question",

  @doc("Agent paused — MUST be answered to continue")
  blocking: "blocking",
}

/**
 * Agent Question Answerer
 *
 * Who is permitted to answer this question.
 *
 * | Value      | Description                                                       |
 * |------------|-------------------------------------------------------------------|
 * | user       | Only the human user can answer                                    |
 * | supervisor | Only the configured supervisor agent can answer                   |
 * | either     | Either may answer; first valid answer wins                        |
 */
@doc("Who is permitted to answer this question")
enum AgentQuestionAnswerer {
  @doc("Only the human user can answer")
  user: "user",

  @doc("Only the configured supervisor agent can answer")
  supervisor: "supervisor",

  @doc("Either user or supervisor may answer")
  either: "either",
}

/**
 * Agent Question Status
 *
 * Lifecycle state machine.
 *
 * | Value     | Description                                                       |
 * |-----------|-------------------------------------------------------------------|
 * | pending   | Awaiting an answer                                                |
 * | answered  | An answerer provided an answer                                    |
 * | expired   | Auto-resolved after expiresAt because defaultAnswer was set       |
 * | cancelled | Explicitly cancelled (agent died, run cancelled, etc.)            |
 */
@doc("Lifecycle status of an agent question")
enum AgentQuestionStatus {
  @doc("Awaiting an answer")
  pending: "pending",

  @doc("Answerer provided a response")
  answered: "answered",

  @doc("Auto-resolved after expiresAt with the configured defaultAnswer")
  expired: "expired",

  @doc("Cancelled (agent died, run cancelled, etc.)")
  cancelled: "cancelled",
}

/**
 * Agent Question
 *
 * A single ask raised by an agent toward the user, supervisor, or
 * either. Persisted to `agent_questions` and surfaced in the unified
 * inbox.
 *
 * ## Properties
 *
 * | Property       | Type                   | Required | Description                                       |
 * |----------------|------------------------|----------|---------------------------------------------------|
 * | id             | UUID                   | Yes      | Unique identifier (from BaseEntity)               |
 * | appId          | string                 | No       | App scope when question originates in app context |
 * | repositoryId   | string                 | No       | Repo scope for standalone-repo agent work         |
 * | featureId      | string                 | No       | Feature scope when applicable                     |
 * | agentRunId     | string                 | Yes      | The agent run that raised the question            |
 * | kind           | AgentQuestionKind      | Yes      | Three-tier urgency                                |
 * | prompt         | string                 | Yes      | Free-form question text                           |
 * | optionsJson    | string                 | No       | JSON-encoded array of multiple-choice options     |
 * | defaultAnswer  | string                 | No       | Used when expiresAt fires for non-blocking kinds  |
 * | answerer       | AgentQuestionAnswerer  | Yes      | Permitted answerer scope                          |
 * | status         | AgentQuestionStatus    | Yes      | Current lifecycle state                           |
 * | answer         | string                 | No       | Final answer text (set on answered/expired)       |
 * | answeredBy     | string                 | No       | Actor namespace of the answerer                   |
 * | answeredAt     | utcDateTime            | No       | When the answer was recorded                      |
 * | expiresAt      | utcDateTime            | No       | Auto-resolution deadline (optional)               |
 * | decision       | Decision               | No       | Structured questions and options (spec 134)       |
 * | responses      | DecisionResponse[]     | No       | Structured answer to `decision` (spec 134)        |
 * | createdAt      | utcDateTime            | Yes      | From BaseEntity                                   |
 * | updatedAt      | utcDateTime            | Yes      | From BaseEntity                                   |
 */
@doc("A question raised by an agent toward the user, supervisor, or either")
model AgentQuestion extends BaseEntity {
  @doc("App scope identifier (set when question originates in app context)")
  appId?: string;

  @doc("Repository scope identifier (set for standalone-repo agent work)")
  repositoryId?: string;

  @doc("Optional feature scope identifier")
  featureId?: string;

  @doc("Agent run that raised this question")
  agentRunId: string;

  @doc("Three-tier urgency")
  kind: AgentQuestionKind;

  @doc("Free-form question text shown to the answerer")
  prompt: string;

  @doc("JSON-encoded array of multiple-choice options (optional)")
  optionsJson?: string;

  @doc("Default answer used when expiresAt fires (non-blocking kinds only)")
  defaultAnswer?: string;

  @doc("Who is permitted to answer this question")
  answerer: AgentQuestionAnswerer;

  @doc("Current lifecycle state")
  status: AgentQuestionStatus;

  @doc("Final answer text, set when status transitions to answered or expired")
  answer?: string;

  @doc("Actor namespace of the answerer, e.g. 'user:<id>' or 'supervisor:<id>'")
  answeredBy?: string;

  @doc("Timestamp when the answer was recorded")
  answeredAt?: utcDateTime;

  @doc("Auto-resolution deadline (optional, used with defaultAnswer)")
  expiresAt?: utcDateTime;

  @doc("Structured questions and options; when set, it is what every surface renders (spec 134)")
  decision?: Decision;

  @doc("Structured answer to `decision`, set when status becomes answered or expired (spec 134)")
  responses?: DecisionResponse[];
}
