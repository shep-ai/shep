import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentQuestionsInbox } from '@/components/agent-questions/agent-questions-inbox';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  type AgentQuestion,
} from '@/domain/generated/output';

function question(overrides: Partial<AgentQuestion> = {}): AgentQuestion {
  return {
    id: 'q-1',
    appId: 'app-1',
    featureId: 'feat-1',
    agentRunId: 'run-abcd1234',
    kind: AgentQuestionKind.question,
    prompt: 'Should we ship?',
    optionsJson: undefined,
    answerer: AgentQuestionAnswerer.user,
    status: AgentQuestionStatus.pending,
    createdAt: '2026-04-29T09:00:00Z',
    updatedAt: '2026-04-29T09:00:00Z',
    ...overrides,
  };
}

describe('AgentQuestionsInbox', () => {
  it('renders the empty state when no questions match the filters', () => {
    render(<AgentQuestionsInbox initialQuestions={[]} />);
    expect(screen.getByTestId('inbox-empty')).toBeInTheDocument();
  });

  it('lists pending questions by default', () => {
    render(
      <AgentQuestionsInbox
        initialQuestions={[
          question({ id: 'q-pending' }),
          question({ id: 'q-answered', status: AgentQuestionStatus.answered }),
        ]}
      />
    );
    expect(screen.getByTestId('question-row-q-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('question-row-q-answered')).not.toBeInTheDocument();
  });

  it('answers through the decision panel with responses', async () => {
    const onAnswer = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(
      <AgentQuestionsInbox
        initialQuestions={[
          question({
            id: 'q-options',
            optionsJson: JSON.stringify(['approve', 'reject']),
          }),
        ]}
        answerOverride={onAnswer}
      />
    );

    await user.click(screen.getByTestId('decision-option-approve'));

    await waitFor(() => {
      expect(onAnswer).toHaveBeenCalledOnce();
    });
    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        questionId: 'q-options',
        responses: [{ questionId: 'q1', optionIds: ['approve'] }],
      })
    );
  });

  it('submits a typed answer when there are no options', async () => {
    const onAnswer = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(
      <AgentQuestionsInbox
        initialQuestions={[question({ id: 'q-free' })]}
        answerOverride={onAnswer}
      />
    );

    await user.type(screen.getByTestId('decision-panel-other-input'), 'use react-flow');
    await user.click(screen.getByTestId('decision-panel-submit'));

    await waitFor(() => {
      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          questionId: 'q-free',
          responses: [{ questionId: 'q1', optionIds: [], customText: 'use react-flow' }],
        })
      );
    });
  });

  it('renders a gate question as a readable decision, never JSON (spec 134)', () => {
    render(
      <AgentQuestionsInbox
        initialQuestions={[
          question({
            id: 'q-gate',
            prompt: JSON.stringify({ event: 'waiting_approval', node: 'merge', runId: 'r' }),
            optionsJson: JSON.stringify(['approve', 'reject']),
          }),
        ]}
      />
    );
    const row = screen.getByTestId('question-row-q-gate');
    expect(row).toHaveTextContent('The pull request is ready to merge');
    expect(row).not.toHaveTextContent('waiting_approval');
    expect(screen.getByTestId('decision-option-approve-recommended')).toBeInTheDocument();
  });

  it('shows an answered decision as an answered row', () => {
    render(
      <AgentQuestionsInbox
        initialStatusFilter="all"
        initialQuestions={[
          question({
            id: 'q-done',
            status: AgentQuestionStatus.answered,
            optionsJson: JSON.stringify(['yes', 'no']),
            answer: 'yes',
            responses: [{ questionId: 'q1', optionIds: ['yes'] }],
          }),
        ]}
      />
    );
    expect(screen.getByTestId('question-answer-q-done')).toHaveTextContent('Answered questions');
  });

  it('renders an inline error when the answer handler fails', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn().mockResolvedValue({ ok: false, error: 'boom' });

    render(
      <AgentQuestionsInbox
        initialQuestions={[
          question({
            id: 'q-err',
            optionsJson: JSON.stringify(['ok']),
          }),
        ]}
        answerOverride={onAnswer}
      />
    );

    await user.click(screen.getByTestId('decision-option-ok'));
    expect(await screen.findByTestId('inbox-error')).toHaveTextContent('boom');
  });

  it('renders the urgency and status filters', () => {
    render(<AgentQuestionsInbox initialQuestions={[]} />);
    expect(screen.getByTestId('status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('kind-filter')).toBeInTheDocument();
  });
});
