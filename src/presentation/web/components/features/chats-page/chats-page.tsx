'use client';

import type { ReactNode } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatConversation } from '@shepai/core/application/use-cases/interactive/list-chat-conversations.use-case';
import { applicationIdFromFeatureId } from '@shepai/core/domain/shared/feature-id';
import { Badge } from '@/components/ui/badge';
import { ChatTab } from '@/components/features/chat/ChatTab';
import { ConversationRail, chatHref } from './conversation-rail';

export interface ChatsPageProps {
  conversations: readonly ChatConversation[];
  selected: ChatConversation;
  /** Replaces the live chat (Storybook renders a mock runtime here). */
  chat?: ReactNode;
}

/** Where a conversation's work also lives outside the chat (the autopilot views). */
function workLink(conversation: ChatConversation): { href: Route; labelKey: string } | null {
  if (conversation.featureId) {
    return { href: `/feature/${conversation.featureId}` as Route, labelKey: 'chats.openOnCanvas' };
  }
  const applicationId = applicationIdFromFeatureId(conversation.scope);
  if (applicationId) {
    return { href: `/application/${applicationId}` as Route, labelKey: 'chats.openApplication' };
  }
  return null;
}

/**
 * The chat-first surface (spec 137): every conversation in a rail, the
 * selected one full height. The chat is a way to start, steer and answer
 * work; features it starts still run on autopilot and stay on the canvas.
 */
export function ChatsPage({ conversations, selected, chat }: ChatsPageProps) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const applicationId = applicationIdFromFeatureId(selected.scope) ?? undefined;
  const link = workLink(selected);

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-e p-3 md:block">
        <ConversationRail conversations={conversations} selectedScope={selected.scope} />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <label className="sr-only" htmlFor="chats-page-picker">
            {t('chats.conversation')}
          </label>
          <select
            id="chats-page-picker"
            value={selected.scope}
            onChange={(e) => router.push(chatHref(e.target.value))}
            className="bg-background max-w-full rounded-md border px-2 py-1 text-sm md:hidden"
          >
            {conversations.map((c) => (
              <option key={c.scope} value={c.scope}>
                {c.title}
              </option>
            ))}
          </select>
          <h1 className="hidden min-w-0 truncate text-base font-semibold md:block">
            {selected.title}
          </h1>
          {selected.subtitle ? (
            <span className="text-muted-foreground hidden text-sm md:inline">
              {selected.subtitle}
            </span>
          ) : null}
          {selected.lifecycle ? (
            <Badge variant="secondary" data-testid="chats-page-lifecycle">
              {t(`chats.lifecycle.${selected.lifecycle}`)}
            </Badge>
          ) : null}
          <span className="flex-1" />
          {link ? (
            <Link
              href={link.href}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              {t(link.labelKey)}
              <ExternalLink className="size-3.5" />
            </Link>
          ) : null}
        </header>

        <div className="min-h-0 flex-1">
          {chat ?? (
            <ChatTab
              key={selected.scope}
              featureId={selected.scope}
              worktreePath={selected.worktreePath}
              {...(applicationId ? { applicationId } : {})}
            />
          )}
        </div>
      </main>
    </div>
  );
}
