/**
 * Decision answer semantics (spec 134).
 *
 * The single place that decides what an answer to a {@link Decision} means.
 * The web panel, the CLI renderer, the chat bridge, the supervisor, WhatsApp
 * and the `ask_decision` tool all resolve, validate and summarise answers here,
 * so "typed text outranks the selection" means the same thing on every surface.
 *
 * Pure and dependency-free: imported by the web bundle as raw source, so
 * relative imports carry no extension.
 */

import {
  DecisionResponseMode,
  type Decision,
  type DecisionOption,
  type DecisionQuestion,
  type DecisionResponse,
} from '../generated/output';

/** Separator between several labels in one answer ("Web, iOS"). */
export const DECISION_LABEL_SEPARATOR = ', ';

/** Separator between per-question answers in a summary. */
const SUMMARY_QUESTION_SEPARATOR = '; ';

/** An answer that does not fit the decision it answers. */
export class InvalidDecisionResponseError extends Error {
  readonly code = 'INVALID_DECISION_RESPONSE';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDecisionResponseError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** True unless the asker is gone and the decision can only be read. */
export function isDecisionAnswerable(decision: Decision): boolean {
  return decision.responseMode !== DecisionResponseMode.NotResumable;
}

function findOptionByText(question: DecisionQuestion, text: string): DecisionOption | undefined {
  const needle = text.trim().toLowerCase();
  if (needle.length === 0) return undefined;
  return (
    question.options.find((o) => o.id.toLowerCase() === needle) ??
    question.options.find((o) => o.label.trim().toLowerCase() === needle)
  );
}

function resolveQuestionFromText(question: DecisionQuestion, text: string): DecisionResponse {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new InvalidDecisionResponseError(`An answer to "${question.question}" is required`);
  }
  const whole = findOptionByText(question, trimmed);
  if (whole) return { questionId: question.id, optionIds: [whole.id] };

  if (question.multiSelect) {
    const parts = trimmed.split(',').map((p) => findOptionByText(question, p));
    if (parts.length > 1 && parts.every((p): p is DecisionOption => p !== undefined)) {
      return { questionId: question.id, optionIds: unique(parts.map((p) => p.id)) };
    }
  }

  if (!question.allowCustom) {
    const allowed = question.options.map((o) => o.label).join(DECISION_LABEL_SEPARATOR);
    throw new InvalidDecisionResponseError(
      `"${trimmed}" is not an option for "${question.question}" (choose one of: ${allowed})`
    );
  }
  return { questionId: question.id, optionIds: [], customText: trimmed };
}

function parseAnswerObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON — a plain answer.
  }
  return undefined;
}

/**
 * Turn a typed answer (CLI `--answer`, a supervisor verdict, a WhatsApp reply)
 * into responses. Per question: an option id, then an option label
 * (case-insensitive), then — for multi-select — comma-separated labels, then
 * custom text when the question allows it. A decision with several questions
 * also accepts a JSON object keyed by question id, question text or header; a
 * plain string then answers every question.
 */
export function resolveResponsesFromText(decision: Decision, text: string): DecisionResponse[] {
  if (decision.questions.length > 1) {
    const byKey = parseAnswerObject(text);
    if (byKey) {
      return decision.questions.map((question) => {
        const value = byKey[question.id] ?? byKey[question.question] ?? byKey[question.header];
        if (typeof value !== 'string') {
          throw new InvalidDecisionResponseError(`An answer to "${question.question}" is required`);
        }
        return resolveQuestionFromText(question, value);
      });
    }
  }
  return decision.questions.map((question) => resolveQuestionFromText(question, text));
}

/** Read the AskUserQuestion answer map (question text → label text) back into responses. */
export function responsesFromAnswersByQuestionText(
  decision: Decision,
  answers: Record<string, string>
): DecisionResponse[] {
  return decision.questions.map((question) =>
    resolveQuestionFromText(question, answers[question.question] ?? '')
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * Apply T3's ranking rule: non-empty typed text outranks selected options, so
 * the options are dropped; blank text and duplicate ids are removed.
 */
export function normalizeResponses(responses: DecisionResponse[]): DecisionResponse[] {
  return responses.map((response) => {
    const customText = response.customText?.trim() ?? '';
    if (customText.length > 0) {
      return { questionId: response.questionId, optionIds: [], customText };
    }
    return { questionId: response.questionId, optionIds: unique(response.optionIds) };
  });
}

/** Throws {@link InvalidDecisionResponseError} unless `responses` fully and only answer `decision`. */
export function validateResponses(decision: Decision, responses: DecisionResponse[]): void {
  const known = new Set(decision.questions.map((q) => q.id));
  for (const response of responses) {
    if (!known.has(response.questionId)) {
      throw new InvalidDecisionResponseError(
        `Decision ${decision.id} has no question "${response.questionId}"`
      );
    }
  }
  for (const question of decision.questions) {
    const response = responses.find((r) => r.questionId === question.id);
    if (!response) {
      throw new InvalidDecisionResponseError(`An answer to "${question.question}" is required`);
    }
    const customText = response.customText?.trim() ?? '';
    if (customText.length > 0 && !question.allowCustom) {
      throw new InvalidDecisionResponseError(
        `"${question.question}" only accepts one of its options`
      );
    }
    for (const optionId of response.optionIds) {
      if (!question.options.some((o) => o.id === optionId)) {
        throw new InvalidDecisionResponseError(
          `"${optionId}" is not an option for "${question.question}"`
        );
      }
    }
    if (!question.multiSelect && response.optionIds.length > 1) {
      throw new InvalidDecisionResponseError(`"${question.question}" accepts a single option`);
    }
    if (response.optionIds.length === 0 && customText.length === 0) {
      throw new InvalidDecisionResponseError(`An answer to "${question.question}" is required`);
    }
  }
}

function answerText(question: DecisionQuestion, response: DecisionResponse | undefined): string {
  if (!response) return '';
  const customText = response.customText?.trim() ?? '';
  if (customText.length > 0) return customText;
  return response.optionIds
    .map((id) => question.options.find((o) => o.id === id)?.label ?? id)
    .join(DECISION_LABEL_SEPARATOR);
}

/** A readable one-line answer: "Redis", or "Platforms: Web, iOS; Auth: OAuth". */
export function summariseResponses(decision: Decision, responses: DecisionResponse[]): string {
  const byQuestion = (q: DecisionQuestion) =>
    answerText(
      q,
      responses.find((r) => r.questionId === q.id)
    );
  if (decision.questions.length === 1) return byQuestion(decision.questions[0]);
  return decision.questions
    .map((q) => `${q.header}: ${byQuestion(q)}`)
    .join(SUMMARY_QUESTION_SEPARATOR);
}

/** Answers keyed by question text with label values — the AskUserQuestion tool-result shape. */
export function answersByQuestionText(
  decision: Decision,
  responses: DecisionResponse[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const question of decision.questions) {
    out[question.question] = answerText(
      question,
      responses.find((r) => r.questionId === question.id)
    );
  }
  return out;
}

/** The recommended answer, or undefined when some question recommends nothing. */
export function recommendedResponses(decision: Decision): DecisionResponse[] | undefined {
  const responses: DecisionResponse[] = [];
  for (const question of decision.questions) {
    const optionIds = question.options.filter((o) => o.recommended === true).map((o) => o.id);
    if (optionIds.length === 0) return undefined;
    responses.push({
      questionId: question.id,
      optionIds: question.multiSelect ? optionIds : [optionIds[0]],
    });
  }
  return responses;
}

/** True when the answer is exactly the recommendation (telemetry: picked-recommended). */
export function responsesPickedRecommended(
  decision: Decision,
  responses: DecisionResponse[]
): boolean {
  const recommended = recommendedResponses(decision);
  if (!recommended) return false;
  return recommended.every((rec) => {
    const actual = responses.find((r) => r.questionId === rec.questionId);
    if (!actual || (actual.customText?.trim() ?? '').length > 0) return false;
    return (
      actual.optionIds.length === rec.optionIds.length &&
      rec.optionIds.every((id) => actual.optionIds.includes(id))
    );
  });
}
