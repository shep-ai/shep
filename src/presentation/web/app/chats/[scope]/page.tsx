import { notFound } from 'next/navigation';
import { resolve } from '@/lib/server-container';
import type { ListChatConversationsUseCase } from '@shepai/core/application/use-cases/interactive/list-chat-conversations.use-case';
import { isChatScopeKey } from '@shepai/core/domain/shared/chat-scope';
import { ChatsPage } from '@/components/features/chats-page';

/** DI-backed page; never pre-render. */
export const dynamic = 'force-dynamic';

interface RouteProps {
  params: Promise<{ scope: string }>;
}

/** The chat-first surface (spec 137): every conversation, one open full height. */
export default async function ChatScopeRoute({ params }: RouteProps) {
  const { scope } = await params;
  const key = decodeURIComponent(scope);
  if (!isChatScopeKey(key)) notFound();

  const conversations = await resolve<ListChatConversationsUseCase>(
    'ListChatConversationsUseCase'
  ).execute();
  const selected = conversations.find((c) => c.scope === key);
  if (!selected) notFound();

  return <ChatsPage conversations={conversations} selected={selected} />;
}
