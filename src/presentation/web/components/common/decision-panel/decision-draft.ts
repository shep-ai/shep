/**
 * Decision draft — the pure state behind {@link DecisionPanel} (spec 134).
 *
 * Mirrors T3 Code's `pendingUserInput.ts` over Shep's Decision model:
 *  - non-empty typed text outranks the selected options (the selection is
 *    kept, so clearing the text restores it);
 *  - selecting an option clears the typed text and hands it back to the host
 *    (`displacedText`) so it is never lost;
 *  - the recommended option is preselected, so Enter accepts it.
 */

import type {
  Decision,
  DecisionQuestion,
  DecisionResponse,
} from '@shepai/core/domain/generated/output';

/** The in-progress answer to one question. */
export interface DecisionDraftAnswer {
  selectedOptionIds?: string[];
  customText?: string;
}

/** In-progress answers keyed by question id. */
export type DecisionDraft = Record<string, DecisionDraftAnswer>;

export interface DecisionProgress {
  /** Clamped index of the active question. */
  index: number;
  total: number;
  question: DecisionQuestion | null;
  /** Options shown as selected (empty while typed text outranks them). */
  selectedOptionIds: string[];
  customText: string;
  usingCustomText: boolean;
  /** The active question's answer, or null when it has none yet. */
  response: DecisionResponse | null;
  answeredCount: number;
  isLast: boolean;
  isComplete: boolean;
  canAdvance: boolean;
}

const DISPLACED_TEXT_SEPARATOR = '\n\n';

export function initialDecisionDraft(decision: Decision): DecisionDraft {
  const draft: DecisionDraft = {};
  for (const question of decision.questions) {
    const recommended = question.options.filter((o) => o.recommended === true).map((o) => o.id);
    if (recommended.length === 0) continue;
    draft[question.id] = {
      selectedOptionIds: question.multiSelect ? recommended : [recommended[0]],
    };
  }
  return draft;
}

export function selectDecisionOption(
  question: DecisionQuestion,
  answer: DecisionDraftAnswer | undefined,
  optionId: string
): { answer: DecisionDraftAnswer; displacedText?: string } {
  const current = answer?.selectedOptionIds ?? [];
  const selectedOptionIds = question.multiSelect
    ? current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId]
    : [optionId];
  const displacedText = answer?.customText?.trim() ?? '';
  return {
    answer: { selectedOptionIds },
    ...(displacedText.length > 0 ? { displacedText } : {}),
  };
}

export function setDecisionCustomText(
  answer: DecisionDraftAnswer | undefined,
  customText: string
): DecisionDraftAnswer {
  return { ...answer, customText };
}

function resolveAnswer(
  question: DecisionQuestion,
  answer: DecisionDraftAnswer | undefined
): DecisionResponse | null {
  const customText = question.allowCustom ? (answer?.customText?.trim() ?? '') : '';
  if (customText.length > 0) return { questionId: question.id, optionIds: [], customText };
  const optionIds = (answer?.selectedOptionIds ?? []).filter((id) =>
    question.options.some((o) => o.id === id)
  );
  if (optionIds.length === 0) return null;
  return { questionId: question.id, optionIds: question.multiSelect ? optionIds : [optionIds[0]] };
}

export function buildDecisionResponses(
  decision: Decision,
  draft: DecisionDraft
): DecisionResponse[] | null {
  const responses: DecisionResponse[] = [];
  for (const question of decision.questions) {
    const response = resolveAnswer(question, draft[question.id]);
    if (!response) return null;
    responses.push(response);
  }
  return responses;
}

export function deriveDecisionProgress(
  decision: Decision,
  draft: DecisionDraft,
  index: number
): DecisionProgress {
  const total = decision.questions.length;
  const clamped = total === 0 ? 0 : Math.max(0, Math.min(index, total - 1));
  const question = decision.questions[clamped] ?? null;
  const answer = question ? draft[question.id] : undefined;
  const response = question ? resolveAnswer(question, answer) : null;
  const customText = question?.allowCustom ? (answer?.customText ?? '') : '';
  const usingCustomText = customText.trim().length > 0;
  return {
    index: clamped,
    total,
    question,
    selectedOptionIds: usingCustomText ? [] : (answer?.selectedOptionIds ?? []),
    customText,
    usingCustomText,
    response,
    answeredCount: decision.questions.filter((q) => resolveAnswer(q, draft[q.id]) !== null).length,
    isLast: total === 0 || clamped >= total - 1,
    isComplete: buildDecisionResponses(decision, draft) !== null,
    canAdvance: response !== null,
  };
}

/** Put text displaced by an option click back into the host's draft, after what is there. */
export function carryDisplacedText(draft: string, displaced: string | undefined): string {
  const text = displaced?.trim() ?? '';
  if (text.length === 0) return draft;
  if (draft.trim().length === 0) return text;
  return `${draft.trimEnd()}${DISPLACED_TEXT_SEPARATOR}${text}`;
}
