/**
 * @module Shep.Agents.Decision
 *
 * One shared "agent asks, user picks" primitive (spec 134).
 *
 * Every moment where a person is asked to choose — a chat `AskUserQuestion`,
 * the PRD questionnaire, an approval gate, a supervisor escalation, or a
 * background agent that asks through the `ask_decision` tool — is described by
 * a {@link Decision} and rendered by the same web component and CLI renderer.
 *
 * A Decision is a request of one or more questions. Each question has options
 * with stable ids; at most one option per question should be `recommended` so
 * every surface can preselect it and a deadline can fall back to it.
 */
/**
 * Decision Response Mode
 *
 * How an answer reaches the asker (mirrors T3 Code's `responseCapability`).
 *
 * | Value         | Description                                                      |
 * |---------------|------------------------------------------------------------------|
 * | live          | The asker is blocked in-process waiting for the answer           |
 * | async         | The asker waits through the database; the answer survives restarts |
 * | not_resumable | The asker is gone; the decision is shown but cannot be answered  |
 */
@doc("How an answer reaches the agent that asked")
enum DecisionResponseMode {
  @doc("The asker is blocked in-process waiting for the answer")
  Live: "live",

  @doc("The asker waits through the database; the answer survives restarts")
  Async: "async",

  @doc("The asker is gone; the decision can be read but no longer answered")
  NotResumable: "not_resumable",
}

/**
 * Decision Kind
 *
 * Which producer raised the decision. Used for routing (gates are forwarded to
 * the approval use cases), copy, and the `decision.answered` telemetry event.
 */
@doc("Which producer raised a decision")
enum DecisionKind {
  @doc("An interactive chat agent called AskUserQuestion")
  ChatQuestion: "chat_question",

  @doc("Requirements discovery questionnaire (PRD)")
  PrdQuestionnaire: "prd_questionnaire",

  @doc("A feature-agent approval gate (requirements, plan or merge)")
  ApprovalGate: "approval_gate",

  @doc("A background agent asked through the ask_decision tool")
  AgentAsk: "agent_ask",

  @doc("A question recorded before spec 134 with plain string options")
  Legacy: "legacy",
}

@doc("A selectable option within a decision question")
model DecisionOption {
  @doc("Stable identifier, unique within its question")
  id: string;

  @doc("Short label shown in bold")
  label: string;

  @doc("One-line explanation shown under the label")
  description: string;

  @doc("Optional preformatted preview (code, mockup, diff) shown when the option is focused")
  preview?: string;

  @doc("True for the option the asker recommends; it is preselected and used when a deadline passes")
  recommended?: boolean;
}

@doc("One question within a decision")
model DecisionQuestion {
  @doc("Stable identifier, unique within its decision")
  id: string;

  @doc("Short chip label (e.g. 'Auth method')")
  header: string;

  @doc("The full question text")
  question: string;

  @doc("Options in display order (1–9 are keyboard shortcuts)")
  options: DecisionOption[];

  @doc("Whether more than one option may be selected")
  multiSelect: boolean;

  @doc("Whether a typed answer is accepted instead of (or with) an option")
  allowCustom: boolean;
}

@doc("A request for a person to choose, made of one or more questions")
model Decision {
  @doc("Stable identifier")
  id: string;

  @doc("Which producer raised the decision")
  kind: DecisionKind;

  @doc("Optional one-line title shown above the questions")
  title?: string;

  @doc("Questions answered together (paged n/N)")
  questions: DecisionQuestion[];

  @doc("How the answer reaches the asker")
  responseMode: DecisionResponseMode;

  @doc("When set, the recommended options are applied if nobody answers before this time")
  defaultAfter?: utcDateTime;
}

@doc("The answer to one decision question")
model DecisionResponse {
  @doc("Question this response answers")
  questionId: string;

  @doc("Selected option ids (empty when only custom text was given)")
  optionIds: string[];

  @doc("Typed answer; when non-empty it outranks the selected options")
  customText?: string;
}
