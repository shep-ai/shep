/**
 * Interaction answer messages (spec 134) — the chat's persisted record of an
 * answered AskUserQuestion, shared by the writer and every reader.
 */

import { describe, it, expect } from 'vitest';
import {
  decisionFromInteractionAnswer,
  formatInteractionAnswerMessage,
  isInteractionAnswerMessage,
  parseInteractionAnswerMessage,
} from '@/domain/shared/interaction-answer.js';

const payload = {
  questions: [{ header: 'Layout', question: 'Which layout?' }],
  answers: { 'Which layout?': 'Grid' },
};

describe('interaction answer messages', () => {
  it('round-trips through the persisted message format', () => {
    const content = formatInteractionAnswerMessage(payload);
    expect(content.startsWith('{{interaction}}')).toBe(true);
    expect(isInteractionAnswerMessage(content)).toBe(true);
    expect(parseInteractionAnswerMessage(content)).toEqual(payload);
  });

  it('rejects ordinary messages and malformed payloads', () => {
    expect(isInteractionAnswerMessage('hello')).toBe(false);
    expect(parseInteractionAnswerMessage('hello')).toBeNull();
    expect(parseInteractionAnswerMessage('{{interaction}}not json')).toBeNull();
  });

  it('becomes a decision with its answers as responses', () => {
    const { decision, responses } = decisionFromInteractionAnswer(payload);
    expect(decision.questions[0]).toMatchObject({ header: 'Layout', question: 'Which layout?' });
    expect(responses).toEqual([{ questionId: 'q1', optionIds: [], customText: 'Grid' }]);
  });
});
