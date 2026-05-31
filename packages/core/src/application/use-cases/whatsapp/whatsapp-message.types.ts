/**
 * WhatsApp outbound message kinds + payload (spec 101)
 *
 * A provider- and locale-agnostic description of an outbound WhatsApp message.
 * Use cases return one of these as their outcome; the infrastructure renderer
 * turns it into localized text and the gateway sends it. This keeps the
 * application layer free of any string/rendering/transport concern.
 */

/**
 * Every outbound WhatsApp message type. No raw strings are compared anywhere —
 * routing and rendering branch on this enum.
 */
export enum WhatsAppMessageKind {
  /** Sender's number is not authorized to use this shep instance. */
  NotLinked = 'not-linked',
  /** A new feature was created from the message. */
  DispatchedFeature = 'dispatched-feature',
  /** A new interactive application session was created from the message. */
  DispatchedApplication = 'dispatched-application',
  /** A reply was forwarded into an interactive application session. */
  ReplyForwardedToSession = 'reply-forwarded-to-session',
  /** An approval gate was approved from the thread. */
  ApprovalAccepted = 'approval-accepted',
  /** An approval gate was rejected from the thread. */
  ApprovalRejected = 'approval-rejected',
  /** A pending agent question was answered from the thread. */
  QuestionAnswered = 'question-answered',
  /** A reply arrived on a thread with no active shep binding. */
  NoActiveThread = 'no-active-thread',
  /** The reply could not be interpreted as a known command. */
  UnknownCommand = 'unknown-command',
  /** Something went wrong handling the message. */
  Error = 'error',

  // ── Outbound lifecycle notifications ──
  /** The agent began working. */
  AgentStarted = 'agent-started',
  /** The agent is waiting for approval at a HITL gate. */
  NeedsApproval = 'needs-approval',
  /** The agent finished successfully. */
  AgentCompleted = 'agent-completed',
  /** The agent failed. */
  AgentFailed = 'agent-failed',
  /** The agent asked a question and is waiting for an answer. */
  AgentQuestion = 'agent-question',
}

/**
 * Optional, already-resolved parameters interpolated into a template.
 * Values are plain strings so the renderer never has to format domain objects.
 */
export interface WhatsAppMessageParams {
  /** A human title (feature name, application description, question text). */
  title?: string;
  /** Extra detail (error message, phase name, gate name). */
  detail?: string;
}

/**
 * A fully-described outbound message: what to say (kind) plus its parameters.
 */
export interface WhatsAppMessage {
  kind: WhatsAppMessageKind;
  params?: WhatsAppMessageParams;
}

/** Convenience constructor. */
export function whatsAppMessage(
  kind: WhatsAppMessageKind,
  params?: WhatsAppMessageParams
): WhatsAppMessage {
  return params ? { kind, params } : { kind };
}
