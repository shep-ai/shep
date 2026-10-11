/**
 * Interaction answer messages (spec 134).
 *
 * When a chat AskUserQuestion is answered, the session persists one user
 * message `{{interaction}}<json>` recording the questions and answers. The
 * writer (interaction coordinator) and every reader (turn grouping on server
 * and web, the chat renderers) go through these helpers, so the format lives
 * in one place. Such a message belongs to the turn that asked; it never opens
 * a new one.
 *
 * Pure; extensionless imports (consumed by the web bundle as raw source).
 */

import { DecisionResponseMode, type Decision, type DecisionResponse } from '../generated/output';
import { decisionFromUserQuestions } from './decision-builders';

/** Prefix that marks an interaction answer message. */
export const INTERACTION_ANSWER_PREFIX = '{{interaction}}';

export interface InteractionAnswerPayload {
  questions: { header: string; question: string }[];
  /** Answers keyed by question text. */
  answers: Record<string, string>;
}

export function formatInteractionAnswerMessage(payload: InteractionAnswerPayload): string {
  return `${INTERACTION_ANSWER_PREFIX}${JSON.stringify(payload)}`;
}

export function isInteractionAnswerMessage(content: string | undefined): boolean {
  return typeof content === 'string' && content.startsWith(INTERACTION_ANSWER_PREFIX);
}

export function parseInteractionAnswerMessage(
  content: string | undefined
): InteractionAnswerPayload | null {
  if (!isInteractionAnswerMessage(content)) return null;
  try {
    const parsed: unknown = JSON.parse((content ?? '').slice(INTERACTION_ANSWER_PREFIX.length));
    if (!parsed || typeof parsed !== 'object') return null;
    const { questions, answers } = parsed as Partial<InteractionAnswerPayload>;
    if (!Array.isArray(questions) || !answers || typeof answers !== 'object') return null;
    return { questions, answers };
  } catch {
    return null;
  }
}

/** The answered questions as a Decision with responses, for the answered-decision row. */
export function decisionFromInteractionAnswer(payload: InteractionAnswerPayload): {
  decision: Decision;
  responses: DecisionResponse[];
} {
  const decision = decisionFromUserQuestions(
    'answered-interaction',
    payload.questions.map((q) => ({ ...q, options: [], multiSelect: false })),
    DecisionResponseMode.NotResumable
  );
  // The persisted record keeps answer text only, so each answer is typed text.
  const responses = decision.questions.map((q) => ({
    questionId: q.id,
    optionIds: [],
    customText: payload.answers[q.question] ?? '',
  }));
  return { decision, responses };
}
