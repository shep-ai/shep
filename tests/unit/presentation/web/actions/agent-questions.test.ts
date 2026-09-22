/**
 * agent-questions server actions — a lost race is not a success (spec 116).
 *
 * Answer and Cancel settle a question with one conditional write; when another
 * caller (CLI, a second tab) settled it first, the use case writes nothing and
 * reports `alreadySettledAs`. The action must surface that to the user instead
 * of returning `ok: true` for an answer that was never recorded.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAnswerExecute = vi.fn();
const mockCancelExecute = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token === 'AnswerAgentQuestionUseCase') return { execute: mockAnswerExecute };
    if (token === 'CancelAgentQuestionUseCase') return { execute: mockCancelExecute };
    throw new Error(`Unknown token: ${token}`);
  },
}));

vi.mock('@/lib/feature-flags', () => ({ requireFeatureFlag: vi.fn() }));

const { answerAgentQuestion, cancelAgentQuestion } = await import(
  '../../../../../src/presentation/web/app/actions/agent-questions.js'
);

const ANSWER_INPUT = { appId: 'app-1', questionId: 'q-1', answer: 'yes', answeredBy: 'user:web' };
const CANCEL_INPUT = { appId: 'app-1', questionId: 'q-1', cancelledBy: 'user:web' };

describe('agent-questions server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answer succeeds when this call recorded the answer', async () => {
    mockAnswerExecute.mockResolvedValue({ enabled: true, forwardedToGate: false, question: {} });

    await expect(answerAgentQuestion(ANSWER_INPUT)).resolves.toEqual({ ok: true });
  });

  it('answer reports failure when the question was already settled', async () => {
    mockAnswerExecute.mockResolvedValue({
      enabled: true,
      forwardedToGate: false,
      question: {},
      alreadySettledAs: 'answered',
    });

    const result = await answerAgentQuestion(ANSWER_INPUT);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('already answered');
  });

  it('cancel reports failure when the question was already settled', async () => {
    mockCancelExecute.mockResolvedValue({
      enabled: true,
      question: {},
      alreadySettledAs: 'answered',
    });

    const result = await cancelAgentQuestion(CANCEL_INPUT);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('already answered');
  });
});
