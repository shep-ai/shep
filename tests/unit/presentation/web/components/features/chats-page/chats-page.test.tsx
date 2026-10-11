/**
 * The chat-first page (spec 137): every conversation in one rail — Shep,
 * repositories, features, applications — and the selected one full height.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ChatScopeKind, SdlcLifecycle } from '@shepai/core/domain/generated/output';
import type { ChatConversation } from '@shepai/core/application/use-cases/interactive/list-chat-conversations.use-case';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/components/features/chat/ChatTab', () => ({
  ChatTab: (props: { featureId: string; worktreePath?: string; applicationId?: string }) => (
    <div
      data-testid="chat-tab"
      data-scope={props.featureId}
      data-worktree={props.worktreePath ?? ''}
      data-app={props.applicationId ?? ''}
    />
  ),
}));

import { ConversationRail } from '@/components/features/chats-page/conversation-rail';
import { ChatsPage } from '@/components/features/chats-page/chats-page';

const conversations: ChatConversation[] = [
  { scope: 'global', kind: ChatScopeKind.Global, title: 'Shep' },
  { scope: 'repo-r1', kind: ChatScopeKind.Repository, title: 'cli', worktreePath: '/code/cli' },
  {
    scope: 'f1',
    kind: ChatScopeKind.Feature,
    title: 'Dark mode',
    subtitle: 'cli',
    worktreePath: '/wt/dark',
    featureId: 'f1',
    lifecycle: SdlcLifecycle.Implementation,
  },
  {
    scope: 'app-a1',
    kind: ChatScopeKind.Application,
    title: 'Todo app',
    worktreePath: '/code/todo',
  },
];

describe('ConversationRail', () => {
  it('groups conversations under Shep, Repositories, Features and Applications', () => {
    render(<ConversationRail conversations={conversations} selectedScope="global" />);

    for (const [group, title] of [
      ['Repositories', 'cli'],
      ['Features', 'Dark mode'],
      ['Applications', 'Todo app'],
    ]) {
      const section = screen.getByRole('region', { name: group });
      expect(within(section).getByRole('link', { name: new RegExp(title) })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /Shep/ })).toHaveAttribute('href', '/chats/global');
    expect(screen.getByRole('link', { name: /Dark mode/ })).toHaveAttribute('href', '/chats/f1');
  });

  it('marks the open conversation', () => {
    render(<ConversationRail conversations={conversations} selectedScope="repo-r1" />);
    expect(screen.getByRole('link', { name: /cli/, current: 'page' })).toHaveAttribute(
      'href',
      '/chats/repo-r1'
    );
  });

  it('leaves out empty groups', () => {
    render(<ConversationRail conversations={conversations.slice(0, 1)} selectedScope="global" />);
    expect(screen.queryByRole('region', { name: 'Features' })).toBeNull();
  });
});

describe('ChatsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the selected conversation in its directory', () => {
    render(<ChatsPage conversations={conversations} selected={conversations[1]} />);
    const tab = screen.getByTestId('chat-tab');
    expect(tab).toHaveAttribute('data-scope', 'repo-r1');
    expect(tab).toHaveAttribute('data-worktree', '/code/cli');
  });

  it('shows a feature conversation with its lifecycle and a way back to the autopilot view', () => {
    render(<ChatsPage conversations={conversations} selected={conversations[2]} />);
    expect(screen.getByTestId('chats-page-lifecycle')).toHaveTextContent('Implementation');
    expect(screen.getByRole('link', { name: 'Open on canvas' })).toHaveAttribute(
      'href',
      '/feature/f1'
    );
  });

  it('opens an application conversation as an application chat', () => {
    render(<ChatsPage conversations={conversations} selected={conversations[3]} />);
    expect(screen.getByTestId('chat-tab')).toHaveAttribute('data-app', 'a1');
    expect(screen.getByRole('link', { name: 'Open application' })).toHaveAttribute(
      'href',
      '/application/a1'
    );
  });

  it('switches conversation from the picker on small screens', () => {
    render(<ChatsPage conversations={conversations} selected={conversations[0]} />);
    fireEvent.change(screen.getByLabelText('Conversation'), { target: { value: 'f1' } });
    expect(push).toHaveBeenCalledWith('/chats/f1');
  });
});
