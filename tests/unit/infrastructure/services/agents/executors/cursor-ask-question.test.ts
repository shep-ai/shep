/**
 * Cursor `cursor/ask_question` ⇄ Shep question translation.
 *
 * Shep's question UI answers with `Record<questionText, "Label A, Label B">`
 * and allows a free-text "Other" answer; Cursor's reply carries option ids
 * only. These tests pin how the two meet.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect } from 'vitest';
import {
  toCursorAskQuestionResponse,
  toUserInteraction,
  type CursorAskQuestionRequest,
} from '@/infrastructure/services/agents/common/executors/cursor-ask-question.js';

const request: CursorAskQuestionRequest = {
  toolCallId: 'call-1',
  title: 'Setup',
  questions: [
    {
      id: 'q-db',
      prompt: 'Which database?',
      options: [
        { id: 'pg', label: 'Postgres' },
        { id: 'sqlite', label: 'SQLite' },
      ],
      allowMultiple: false,
    },
    {
      id: 'q-extras',
      prompt: 'Which extras?',
      options: [
        { id: 'auth', label: 'Auth' },
        { id: 'ci', label: 'CI, CD' },
        { id: 'docs', label: 'Docs' },
      ],
      allowMultiple: true,
    },
  ],
};

describe('toUserInteraction', () => {
  it('maps Cursor questions to the Shep interaction shape', () => {
    expect(toUserInteraction(request)).toEqual({
      toolCallId: 'call-1',
      questions: [
        {
          question: 'Which database?',
          header: 'Setup',
          options: [
            { label: 'Postgres', description: '' },
            { label: 'SQLite', description: '' },
          ],
          multiSelect: false,
        },
        {
          question: 'Which extras?',
          header: 'Setup',
          options: [
            { label: 'Auth', description: '' },
            { label: 'CI, CD', description: '' },
            { label: 'Docs', description: '' },
          ],
          multiSelect: true,
        },
      ],
    });
  });

  it('supplies a tool call id and a header when Cursor omits them', () => {
    const interaction = toUserInteraction({ questions: request.questions.slice(0, 1) });
    expect(interaction.toolCallId).not.toBe('');
    expect(interaction.questions[0].header).toBe('Question');
  });
});

describe('toCursorAskQuestionResponse', () => {
  it('answers with the option ids of the selected labels, including a label containing ", "', () => {
    expect(
      toCursorAskQuestionResponse(request, {
        'Which database?': 'SQLite',
        'Which extras?': 'Auth, CI, CD',
      })
    ).toEqual({
      outcome: {
        outcome: 'answered',
        answers: [
          { questionId: 'q-db', selectedOptionIds: ['sqlite'] },
          { questionId: 'q-extras', selectedOptionIds: ['auth', 'ci'] },
        ],
      },
    });
  });

  it('skips with a reason quoting every answer when one is free text', () => {
    // Cursor cannot carry free text in an answer, so the agent reads it here.
    const response = toCursorAskQuestionResponse(request, {
      'Which database?': 'MySQL please',
      'Which extras?': 'Docs',
    });
    expect(response).toEqual({
      outcome: {
        outcome: 'skipped',
        reason:
          'The user answered in their own words:\n' +
          '- Which database?: MySQL please\n' +
          '- Which extras?: Docs',
      },
    });
  });

  it('skips when a selection mixes a label with free text', () => {
    const response = toCursorAskQuestionResponse(request, {
      'Which database?': 'Postgres',
      'Which extras?': 'Auth, something custom',
    });
    expect(response.outcome.outcome).toBe('skipped');
  });

  it('cancels when no question was answered (session stopped mid-question)', () => {
    expect(toCursorAskQuestionResponse(request, {})).toEqual({
      outcome: { outcome: 'cancelled' },
    });
  });
});
