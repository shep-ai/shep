/**
 * Chat blocks inside a live conversation (spec 137): a block message renders
 * its inline block, answers go to the respond route, and an answer row reads
 * as words.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  ChatBlockAction,
  InteractiveMessageRole,
  type InteractiveMessage,
} from '@shepai/core/domain/generated/output';
import {
  formatChatBlockMessage,
  formatChatBlockResponseMessage,
} from '@shepai/core/domain/shared/chat-block';
import { specReviewBlock } from '@/components/common/chat-blocks/chat-block-fixtures';
import { ChatBlocksProvider } from '@/components/features/chat/chat-blocks-context';
import { ChatBlockMessage } from '@/components/features/chat/ChatBlockMessage';
import { ChatBlockResponseRow } from '@/components/features/chat/ChatBlockResponseRow';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));

function msg(id: string, role: InteractiveMessageRole, content: string): InteractiveMessage {
  return { id, featureId: 'repo-r1', role, content, createdAt: new Date(), updatedAt: new Date() };
}

const blockContent = formatChatBlockMessage(specReviewBlock);
const approvedContent = formatChatBlockResponseMessage({
  blockId: specReviewBlock.id,
  action: ChatBlockAction.Approve,
});

function wrap(messages: InteractiveMessage[]) {
  const client = new QueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ChatBlocksProvider scope="repo-r1" worktreePath="/code/cli" messages={messages}>
          {children}
        </ChatBlocksProvider>
      </QueryClientProvider>
    );
  };
}

describe('ChatBlockMessage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the block a message carries, open for an answer', () => {
    render(<ChatBlockMessage content={blockContent} />, {
      wrapper: wrap([msg('a1', InteractiveMessageRole.assistant, blockContent)]),
    });
    expect(screen.getByTestId('inline-block-spec_review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('posts the answer to the respond route of its conversation', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ message: { id: 'm9' } }) });
    render(<ChatBlockMessage content={blockContent} />, {
      wrapper: wrap([msg('a1', InteractiveMessageRole.assistant, blockContent)]),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/interactive/chat/repo-r1/blocks/${specReviewBlock.id}/respond`);
    expect(JSON.parse(init.body)).toEqual({ action: 'approve', worktreePath: '/code/cli' });
  });

  it('tells the user when the answer was not delivered and keeps the block open', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'already' }),
    });
    render(<ChatBlockMessage content={blockContent} />, {
      wrapper: wrap([msg('a1', InteractiveMessageRole.assistant, blockContent)]),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('shows the answer once the conversation holds one', () => {
    render(<ChatBlockMessage content={blockContent} />, {
      wrapper: wrap([
        msg('a1', InteractiveMessageRole.assistant, blockContent),
        msg('u1', InteractiveMessageRole.user, approvedContent),
      ]),
    });
    expect(screen.getByTestId('chat-block-resolution')).toHaveTextContent('Approved');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('renders nothing for a malformed block', () => {
    const { container } = render(<ChatBlockMessage content="{{block}}{oops" />, {
      wrapper: wrap([]),
    });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ChatBlockResponseRow', () => {
  it('reads the answer in words with the block title', () => {
    render(<ChatBlockResponseRow content={approvedContent} />, {
      wrapper: wrap([msg('a1', InteractiveMessageRole.assistant, blockContent)]),
    });
    expect(screen.getByTestId('chat-block-response-row')).toHaveTextContent('Approved');
    expect(screen.getByTestId('chat-block-response-row')).toHaveTextContent('Login PRD');
  });
});
