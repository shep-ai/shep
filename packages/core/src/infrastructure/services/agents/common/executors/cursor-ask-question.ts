/**
 * Cursor `cursor/ask_question` ⇄ Shep question translation.
 *
 * In ACP mode the Cursor agent asks the user questions through the
 * `cursor/ask_question` extension request (verified against cursor-agent
 * 2026.09.26). This module converts that payload to the
 * {@link UserInteractionData} the chat's question UI renders, and converts the
 * UI's answer map back into Cursor's reply.
 *
 * The two answer shapes do not line up exactly: the UI returns
 * `Record<questionText, "Label A, Label B">` and allows a free-text "Other"
 * answer, while Cursor's `answered` reply carries option ids only. When any
 * answer is free text the questions are reported as `skipped`, with a reason
 * that quotes every answer, so the agent still reads what the user wrote.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  UserInteractionData,
  UserQuestion,
} from '../../../../../application/ports/output/agents/interactive-agent-executor.interface.js';

/** ACP extension method Cursor calls to ask the user questions. */
export const CURSOR_ASK_QUESTION_METHOD = 'cursor/ask_question';

/** Header shown on a question chip when Cursor sends no title. */
const DEFAULT_QUESTION_HEADER = 'Question';

/** Separator the question UI joins multi-select labels with. */
const ANSWER_SEPARATOR = ', ';

/** Params of a `cursor/ask_question` request. */
export const cursorAskQuestionRequestSchema = z.object({
  toolCallId: z.string().optional(),
  title: z.string().optional(),
  questions: z.array(
    z.object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.object({ id: z.string(), label: z.string() })),
      allowMultiple: z.boolean().optional(),
    })
  ),
});

export type CursorAskQuestionRequest = z.infer<typeof cursorAskQuestionRequestSchema>;

/** Reply to a `cursor/ask_question` request. */
export interface CursorAskQuestionResponse {
  [key: string]: unknown;
  outcome:
    | {
        outcome: 'answered';
        answers: { questionId: string; selectedOptionIds: string[] }[];
      }
    | { outcome: 'skipped'; reason: string }
    | { outcome: 'cancelled' };
}

/** `value` unless it is missing or blank. */
function nonEmpty(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

/** The Shep interaction the question UI renders for a Cursor request. */
export function toUserInteraction(request: CursorAskQuestionRequest): UserInteractionData {
  const header = nonEmpty(request.title) ?? DEFAULT_QUESTION_HEADER;
  const questions: UserQuestion[] = request.questions.map((question) => ({
    question: question.prompt,
    header,
    options: question.options.map((option) => ({ label: option.label, description: '' })),
    multiSelect: question.allowMultiple ?? false,
  }));
  return { toolCallId: nonEmpty(request.toolCallId) ?? randomUUID(), questions };
}

/**
 * The option ids an answer selects, or null when the answer contains text that
 * is not one of the labels.
 *
 * Labels are matched longest first as whole `", "`-separated segments, so a
 * label that itself contains `", "` ("CI, CD") is not split into two.
 */
function selectedOptionIds(
  answer: string,
  options: CursorAskQuestionRequest['questions'][number]['options']
): string[] | null {
  let rest = `${ANSWER_SEPARATOR}${answer.trim()}${ANSWER_SEPARATOR}`;
  const selected = new Set<string>();
  const byLength = [...options].sort((a, b) => b.label.length - a.label.length);
  for (const option of byLength) {
    const segment = `${ANSWER_SEPARATOR}${option.label}${ANSWER_SEPARATOR}`;
    if (rest.includes(segment)) {
      selected.add(option.id);
      rest = rest.replace(segment, ANSWER_SEPARATOR);
    }
  }
  const leftover = rest.split(ANSWER_SEPARATOR).some((part) => part.trim().length > 0);
  if (leftover || selected.size === 0) return null;
  // Report ids in the order Cursor listed the options.
  return options.filter((option) => selected.has(option.id)).map((option) => option.id);
}

/** Cursor's reply for the answers the question UI returned. */
export function toCursorAskQuestionResponse(
  request: CursorAskQuestionRequest,
  answers: Record<string, string>
): CursorAskQuestionResponse {
  const answered = request.questions.filter((question) => answers[question.prompt]?.trim());
  // No answer at all: the session stopped while the question was open.
  if (answered.length === 0) return { outcome: { outcome: 'cancelled' } };

  const selections = request.questions.map((question) => ({
    questionId: question.id,
    ids: selectedOptionIds(answers[question.prompt] ?? '', question.options),
  }));

  if (selections.every((selection) => selection.ids !== null)) {
    return {
      outcome: {
        outcome: 'answered',
        answers: selections.map((selection) => ({
          questionId: selection.questionId,
          selectedOptionIds: selection.ids ?? [],
        })),
      },
    };
  }

  const quoted = request.questions
    .map((question) => `- ${question.prompt}: ${answers[question.prompt]?.trim() || '(no answer)'}`)
    .join('\n');
  return {
    outcome: { outcome: 'skipped', reason: `The user answered in their own words:\n${quoted}` },
  };
}
