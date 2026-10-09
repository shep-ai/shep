/**
 * Agent-asked decisions (spec 134, part 2).
 *
 * A background agent may ask when it is genuinely blocked — always with one
 * recommended option and a deadline. If nobody answers by the deadline the
 * agent proceeds with the recommendation. This module owns the deadline rules
 * and the shape such a question may take.
 *
 * Pure; extensionless imports.
 */

import {
  AgentQuestionStatus,
  DecisionKind,
  DecisionOutcome,
  DecisionResponseMode,
  type AgentQuestion,
  type Decision,
} from '../generated/output';

/** Name of the MCP tool a headless agent asks through. */
export const ASK_DECISION_TOOL_NAME = 'ask_decision';

/** Default minutes an agent's question waits before the recommendation applies. */
export const DEFAULT_DECISION_TIMEOUT_MINUTES = 30;
/** No agent waits more than a day. */
export const MAX_DECISION_TIMEOUT_MINUTES = 24 * 60;
const MIN_DECISION_TIMEOUT_MINUTES = 1;
const MS_PER_MINUTE = 60_000;

/** Actor recorded when a deadline answers a question with its recommendation. */
export const DECISION_DEADLINE_ACTOR = 'system:deadline';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 9;
const MAX_QUESTION_CHARS = 1_000;
const MAX_LABEL_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 500;
const MAX_PREVIEW_CHARS = 4_000;

export class InvalidAgentDecisionError extends Error {
  readonly code = 'INVALID_AGENT_DECISION';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAgentDecisionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function usableMinutes(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The request's minutes, else the configured default, else 30 — clamped to 1 minute … 1 day. */
export function resolveDecisionTimeoutMinutes(
  requested: number | undefined,
  configured: number | undefined
): number {
  const minutes =
    usableMinutes(requested) ?? usableMinutes(configured) ?? DEFAULT_DECISION_TIMEOUT_MINUTES;
  return Math.min(
    MAX_DECISION_TIMEOUT_MINUTES,
    Math.max(MIN_DECISION_TIMEOUT_MINUTES, Math.round(minutes))
  );
}

export function decisionDeadline(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * MS_PER_MINUTE);
}

export interface AgentAskOption {
  label: string;
  description?: string;
  preview?: string;
  recommended?: boolean;
}

export interface AgentAsk {
  question: string;
  header?: string;
  options: AgentAskOption[];
  multiSelect?: boolean;
  /** Defaults to true: the person may answer in their own words. */
  allowCustom?: boolean;
  defaultAfter: Date;
}

function bounded(value: string, max: number, what: string): string {
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new InvalidAgentDecisionError(`${what} is longer than ${max} characters`);
  }
  return trimmed;
}

/**
 * Validate a background agent's question and build its Decision. Option ids
 * are generated here (`o1…`), never taken from the model.
 */
export function decisionFromAgentAsk(id: string, ask: AgentAsk): Decision {
  const question = bounded(ask.question, MAX_QUESTION_CHARS, 'The question');
  if (question.length === 0) throw new InvalidAgentDecisionError('The question is empty');
  if (ask.options.length < MIN_OPTIONS || ask.options.length > MAX_OPTIONS) {
    throw new InvalidAgentDecisionError(
      `Offer between ${MIN_OPTIONS} and ${MAX_OPTIONS} options (got ${ask.options.length})`
    );
  }
  const labels = ask.options.map((o) => bounded(o.label, MAX_LABEL_CHARS, 'An option label'));
  if (labels.some((l) => l.length === 0)) {
    throw new InvalidAgentDecisionError('Every option needs a label');
  }
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) {
    throw new InvalidAgentDecisionError('Option labels must be distinct');
  }
  const multiSelect = ask.multiSelect === true;
  const recommendedCount = ask.options.filter((o) => o.recommended === true).length;
  if (!multiSelect && recommendedCount !== 1) {
    throw new InvalidAgentDecisionError(
      `Mark exactly one option as recommended (got ${recommendedCount})`
    );
  }
  if (multiSelect && recommendedCount === 0) {
    throw new InvalidAgentDecisionError('Mark at least one option as recommended');
  }
  return {
    id,
    kind: DecisionKind.AgentAsk,
    responseMode: DecisionResponseMode.Async,
    defaultAfter: ask.defaultAfter,
    questions: [
      {
        id: 'q1',
        header: ask.header?.trim() ? bounded(ask.header, MAX_LABEL_CHARS, 'The header') : question,
        question,
        multiSelect,
        allowCustom: ask.allowCustom !== false,
        options: ask.options.map((o, i) => ({
          id: `o${i + 1}`,
          label: labels[i],
          description: bounded(o.description ?? '', MAX_DESCRIPTION_CHARS, 'An option description'),
          ...(o.preview
            ? { preview: bounded(o.preview, MAX_PREVIEW_CHARS, 'An option preview') }
            : {}),
          ...(o.recommended ? { recommended: true } : {}),
        })),
      },
    ],
  };
}

const OUTCOME_BY_STATUS: Record<AgentQuestionStatus, DecisionOutcome> = {
  [AgentQuestionStatus.pending]: DecisionOutcome.Pending,
  [AgentQuestionStatus.answered]: DecisionOutcome.Answered,
  // An expired question was settled with its default — the recommendation.
  [AgentQuestionStatus.expired]: DecisionOutcome.Defaulted,
  [AgentQuestionStatus.cancelled]: DecisionOutcome.Cancelled,
};

/** What became of a question, for the feature's activity. */
export function decisionOutcomeOf(question: AgentQuestion): DecisionOutcome {
  return OUTCOME_BY_STATUS[question.status];
}
