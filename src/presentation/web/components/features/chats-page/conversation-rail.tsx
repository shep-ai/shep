'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { Boxes, FolderGit2, GitBranch, MessagesSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChatScopeKind } from '@shepai/core/domain/generated/output';
import type { ChatConversation } from '@shepai/core/application/use-cases/interactive/list-chat-conversations.use-case';
import { ChatDotIndicator } from '@/components/features/chat/ChatDotIndicator';
import { useTurnStatus } from '@/hooks/use-turn-statuses';
import { cn } from '@/lib/utils';

/** Group order and look: the Shep-wide chat first, then repositories, features, applications. */
const GROUPS: { kind: ChatScopeKind; icon: LucideIcon }[] = [
  { kind: ChatScopeKind.Global, icon: MessagesSquare },
  { kind: ChatScopeKind.Repository, icon: FolderGit2 },
  { kind: ChatScopeKind.Feature, icon: GitBranch },
  { kind: ChatScopeKind.Application, icon: Boxes },
];

export function chatHref(scope: string): Route {
  return `/chats/${encodeURIComponent(scope)}` as Route;
}

function ConversationRow({
  conversation,
  icon: Icon,
  selected,
}: {
  conversation: ChatConversation;
  icon: LucideIcon;
  selected: boolean;
}) {
  const status = useTurnStatus(conversation.scope);
  return (
    <Link
      href={chatHref(conversation.scope)}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'
      )}
    >
      <span className="relative shrink-0">
        <Icon className="text-muted-foreground size-4" />
        <ChatDotIndicator status={status} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{conversation.title}</span>
        {conversation.subtitle ? (
          <span className="text-muted-foreground block truncate text-xs">
            {conversation.subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export interface ConversationRailProps {
  conversations: readonly ChatConversation[];
  selectedScope: string;
  className?: string;
}

/** Every conversation, grouped by what it is attached to (spec 137). */
export function ConversationRail({
  conversations,
  selectedScope,
  className,
}: ConversationRailProps) {
  const { t } = useTranslation('web');
  return (
    <nav aria-label={t('chats.conversations')} className={cn('flex flex-col gap-4', className)}>
      {GROUPS.map(({ kind, icon }) => {
        const members = conversations.filter((c) => c.kind === kind);
        if (members.length === 0) return null;
        const headingId = `chats-group-${kind}`;
        return (
          <section key={kind} aria-labelledby={headingId}>
            {kind === ChatScopeKind.Global ? (
              <h2 id={headingId} className="sr-only">
                {t(`chats.groups.${kind}`)}
              </h2>
            ) : (
              <h2
                id={headingId}
                className="text-muted-foreground mb-1 px-2 text-xs font-medium tracking-wide uppercase"
              >
                {t(`chats.groups.${kind}`)}
              </h2>
            )}
            <div className="flex flex-col gap-0.5">
              {members.map((conversation) => (
                <ConversationRow
                  key={conversation.scope}
                  conversation={conversation}
                  icon={icon}
                  selected={conversation.scope === selectedScope}
                />
              ))}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
