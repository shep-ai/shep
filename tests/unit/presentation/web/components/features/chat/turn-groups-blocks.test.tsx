/**
 * Chat blocks in the turn-grouped timeline (spec 137): a turn opened by an
 * answer to a block gets a readable title.
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ChatBlockAction,
  ChatBlockType,
  InteractiveMessageRole,
  type InteractiveMessage,
} from '@shepai/core/domain/generated/output';
import {
  formatChatBlockMessage,
  formatChatBlockResponseMessage,
} from '@shepai/core/domain/shared/chat-block';
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

describe('chat blocks in turn groups', () => {
  it('titles the turn an answer opens in words', () => {
    const messages = [
      msg('u1', InteractiveMessageRole.user, 'Write the PRD', 1),
      msg(
        'a1',
        InteractiveMessageRole.assistant,
        formatChatBlockMessage({
          id: 'b1',
          type: ChatBlockType.SpecReview,
          title: 'Login PRD',
          markdown: '# Login',
        }),
        2
      ),
      msg(
        'u2',
        InteractiveMessageRole.user,
        formatChatBlockResponseMessage({ blockId: 'b1', action: ChatBlockAction.Approve }),
        3
      ),
    ];

    const view = computeTurnGroupsFromMessages(messages, false);

    expect(view.groups.map((g) => g.title)).toEqual([
      'Working on: Write the PRD',
      'Working on: Approved "Login PRD"',
    ]);
  });
});

describe('chat blocks in turn cards', () => {
  const blockContent = formatChatBlockMessage({
    id: 'b1',
    type: ChatBlockType.PlanCard,
    title: 'Dark mode',
    markdown: '1. Tokens',
  });
  const messages = [
    msg('u1', InteractiveMessageRole.user, 'Plan dark mode', 1),
    msg('a1', InteractiveMessageRole.assistant, blockContent, 2),
  ];

  it('keeps a block visible on a completed, collapsed card', () => {
    const view = computeTurnGroupsFromMessages(messages, false);
    render(<SingleTurnCard group={view.groups[0]} allMessages={messages} />);

    expect(screen.getByRole('button', { name: /Working on: Plan dark mode/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByTestId('inline-block-plan_card')).toHaveTextContent('Dark mode');
  });

  it('shows the block once, not again among the expanded raw messages', () => {
    const view = computeTurnGroupsFromMessages(messages, false);
    render(<SingleTurnCard group={view.groups[0]} allMessages={messages} />);

    fireEvent.click(screen.getByRole('button', { name: /Working on: Plan dark mode/ }));

    expect(screen.getAllByTestId('inline-block-plan_card')).toHaveLength(1);
    expect(screen.queryByText(/\{\{block\}\}/)).toBeNull();
  });

  it('shows the block on the in-progress card as well', () => {
    const view = computeTurnGroupsFromMessages(messages, true);
    render(
      <SingleTurnCard
        group={view.currentTurn!}
        allMessages={messages}
        streaming={{ text: '', statusLog: null, awaiting: false, sessionStatus: 'ready' }}
      />
    );
    expect(screen.getByTestId('inline-block-plan_card')).toBeInTheDocument();
  });

  it('shows an answer that opened the live turn in words', () => {
    const answered = [
      ...messages,
      msg(
        'u2',
        InteractiveMessageRole.user,
        formatChatBlockResponseMessage({ blockId: 'b1', action: ChatBlockAction.Implement }),
        3
      ),
    ];
    const view = computeTurnGroupsFromMessages(answered, true);
    render(
      <SingleTurnCard
        group={view.currentTurn!}
        allMessages={answered}
        streaming={{ text: '', statusLog: null, awaiting: true, sessionStatus: 'ready' }}
      />
    );
    expect(screen.getByTestId('chat-block-response-row')).toHaveTextContent('Implementing');
    expect(screen.queryByText(/block-response/)).toBeNull();
  });
});
