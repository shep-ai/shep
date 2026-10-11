/**
 * Web turn grouping keeps an answered question in its turn and renders it as
 * an "Answered questions" row, not raw JSON (spec 134).
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  InteractiveMessageRole,
  type InteractiveMessage,
} from '@shepai/core/domain/generated/output';
import { formatInteractionAnswerMessage } from '@shepai/core/domain/shared/interaction-answer';
import {
  SingleTurnCard,
  computeTurnGroupsFromMessages,
} from '@/components/features/chat/turn-group-list';

function msg(id: string, role: InteractiveMessageRole, content: string, at: number) {
  return {
    id,
    featureId: 'f1',
    role,
    content,
    createdAt: new Date(at),
    updatedAt: new Date(at),
  } as InteractiveMessage;
}

const answer = formatInteractionAnswerMessage({
  questions: [{ header: 'Layout', question: 'Which layout?' }],
  answers: { 'Which layout?': 'Grid' },
});
const messages = [
  msg('m1', InteractiveMessageRole.user, 'Build a dashboard', 1),
  msg('m2', InteractiveMessageRole.assistant, 'Which layout?', 2),
  msg('m3', InteractiveMessageRole.user, answer, 3),
];

describe('answered questions in the chat timeline', () => {
  it('do not open a new turn', () => {
    const view = computeTurnGroupsFromMessages(messages, false);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].messageIds).toEqual(['m1', 'm2', 'm3']);
  });

  it('render as an answered row inside the turn', () => {
    const view = computeTurnGroupsFromMessages(messages, false);
    render(<SingleTurnCard group={view.groups[0]} allMessages={messages} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByTestId('answered-decision-row')).toHaveTextContent('Grid');
    expect(screen.queryByText(/\{\{interaction\}\}/)).not.toBeInTheDocument();
  });
});
