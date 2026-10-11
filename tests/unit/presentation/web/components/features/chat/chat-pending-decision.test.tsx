/**
 * ChatPendingDecision (spec 134) — a chat AskUserQuestion rendered through the
 * shared DecisionPanel and answered in the shape the agent expects.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  ChatPendingDecision,
  type ChatInteraction,
} from '@/components/features/chat/ChatPendingDecision';
import { DECISION_AUTO_ADVANCE_MS } from '@/components/common/decision-panel';
import { SingleTurnCard } from '@/components/features/chat/turn-group-list';

const interaction: ChatInteraction = {
  toolCallId: 'tu_1',
  questions: [
    {
      question: 'Which layout?',
      header: 'Layout',
      multiSelect: false,
      options: [
        { label: 'Grid', description: 'Cards in a grid', preview: '[ ][ ]' },
        { label: 'List', description: 'One per row' },
      ],
    },
  ],
};

describe('ChatPendingDecision', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the question with its option preview', () => {
    render(<ChatPendingDecision interaction={interaction} onRespond={vi.fn()} />);
    fireEvent.click(screen.getByTestId('decision-option-o1'));
    expect(screen.getByTestId('decision-panel-preview')).toHaveTextContent('[ ][ ]');
  });

  it('answers with labels keyed by question text', () => {
    const onRespond = vi.fn();
    render(<ChatPendingDecision interaction={interaction} onRespond={onRespond} />);
    fireEvent.keyDown(document, { key: '2' });
    act(() => vi.advanceTimersByTime(DECISION_AUTO_ADVANCE_MS));
    expect(onRespond).toHaveBeenCalledWith({ 'Which layout?': 'List' });
  });
});

describe('SingleTurnCard with a pending decision', () => {
  it('renders the decision inside the in-progress turn that asked', () => {
    render(
      <SingleTurnCard
        group={{
          id: 'turn-1',
          title: 'Working on: dashboard',
          status: 'in-progress',
          userMessagePreview: 'dashboard',
          messageIds: [],
          assistantMessageCount: 0,
          startedAt: 0,
          endedAt: 0,
        }}
        allMessages={[]}
        decision={<div data-testid="inline-decision" />}
      />
    );
    expect(screen.getByTestId('inline-decision')).toBeInTheDocument();
  });
});
