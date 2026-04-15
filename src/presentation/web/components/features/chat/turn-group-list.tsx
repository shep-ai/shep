'use client';

/**
 * TurnGroupList
 *
 * Fetches the server-derived list of user turns for a feature and
 * renders a `TurnGroupCard` per completed group PLUS an in-progress
 * card for the currently-live turn. The in-progress card is expanded
 * by default and receives the live streaming indicator inline, so
 * the moment the user sends a message they see a single "Working
 * on your request…" surface with the reply building up inside it.
 *
 * All grouping logic lives in `GetChatTurnGroupsUseCase` — this
 * component is a thin renderer.
 */

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { InteractiveMessage } from '@shepai/core/domain/generated/output';
import { InteractiveMessageRole } from '@shepai/core/domain/generated/output';
import { TurnGroupCard } from './turn-group-card';

interface TurnGroupDto {
  id: string;
  title: string;
  userMessagePreview: string;
  messageIds: string[];
  assistantMessageCount: number;
  startedAt: number;
  endedAt: number;
  status: 'completed' | 'in-progress';
}

export interface TurnGroupsResponse {
  groups: TurnGroupDto[];
  currentTurn: TurnGroupDto | null;
  hiddenMessageIds: string[];
}

export function turnGroupsQueryKey(featureId: string): readonly unknown[] {
  return ['chat', featureId, 'turn-groups'] as const;
}

export async function fetchTurnGroups(featureId: string): Promise<TurnGroupsResponse> {
  const res = await fetch(`/api/interactive/chat/${encodeURIComponent(featureId)}/turn-groups`);
  if (!res.ok) {
    return { groups: [], currentTurn: null, hiddenMessageIds: [] };
  }
  return (await res.json()) as TurnGroupsResponse;
}

/** Live streaming state the in-progress card pins at its bottom edge. */
export interface TurnStreamingState {
  /** Persisted streaming text or the live SSE delta, whichever is longer. */
  text: string;
  /** Short "Reading file X" style indicator from tool events. */
  statusLog: string | null;
  /** True while we're between send and first delta. */
  awaiting: boolean;
  /** "booting" / "idle" / etc. */
  sessionStatus: string | null;
}

/**
 * Hook returning both the raw groups data (for filtering the thread
 * upstream) and the list of hidden message ids. Kept here alongside
 * the component so the single query is shared — ChatTab calls this
 * hook too and TanStack dedupes on the shared query key.
 */
export function useTurnGroups(featureId: string): TurnGroupsResponse {
  const enabled = featureId.trim().length > 0;
  const { data } = useQuery({
    queryKey: turnGroupsQueryKey(featureId),
    queryFn: () => fetchTurnGroups(featureId),
    // Short stale window so the card appears fast when the user
    // sends a message — the chat-state refetch triggered by the
    // mutation will bump this in practice, but the low staleTime
    // is a belt-and-braces fallback.
    staleTime: 1_000,
    refetchOnWindowFocus: false,
    enabled,
  });
  return data ?? { groups: [], currentTurn: null, hiddenMessageIds: [] };
}

export interface TurnGroupListProps {
  featureId: string;
  /** Raw messages from the main chat query — used to hydrate cards. */
  allMessages: readonly InteractiveMessage[];
  /** Live streaming state for the in-progress card. */
  streaming: TurnStreamingState;
}

export function TurnGroupList({ featureId, allMessages, streaming }: TurnGroupListProps) {
  const { groups, currentTurn } = useTurnGroups(featureId);
  if (groups.length === 0 && !currentTurn) return null;

  // Index messages by id once so every card's children are O(1) lookups.
  const byId = new Map<string, InteractiveMessage>();
  for (const m of allMessages) byId.set(m.id, m);

  return (
    <div className="flex flex-col">
      {groups.map((g) => (
        <TurnGroupCard
          key={g.id}
          id={g.id}
          title={g.title}
          status="completed"
          assistantMessageCount={g.assistantMessageCount}
        >
          <TurnChildMessages messageIds={g.messageIds} byId={byId} />
        </TurnGroupCard>
      ))}
      {currentTurn ? (
        <TurnGroupCard
          key={currentTurn.id}
          id={currentTurn.id}
          title={currentTurn.title}
          status="in-progress"
          assistantMessageCount={currentTurn.assistantMessageCount}
        >
          <div className="flex flex-col gap-2">
            <TurnChildMessages messageIds={currentTurn.messageIds} byId={byId} />
            <StreamingIndicator streaming={streaming} />
          </div>
        </TurnGroupCard>
      ) : null}
    </div>
  );
}

function TurnChildMessages({
  messageIds,
  byId,
}: {
  messageIds: readonly string[];
  byId: Map<string, InteractiveMessage>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {messageIds.map((mid) => {
        const msg = byId.get(mid);
        if (!msg) {
          // Happens briefly after a send: the turn-groups query
          // returned before the chat-state query refetched.
          return (
            <div key={mid} className="text-muted-foreground/50 text-[11px] italic">
              …
            </div>
          );
        }
        const isUser = msg.role === InteractiveMessageRole.user;
        return (
          <div
            key={mid}
            className={
              isUser
                ? 'text-foreground border-l-2 border-violet-500/50 pl-2 text-[12px] whitespace-pre-wrap'
                : 'text-foreground/90 pl-2 text-[12px] whitespace-pre-wrap'
            }
          >
            <div className="text-muted-foreground/70 mb-0.5 text-[10px] font-medium tracking-wide uppercase">
              {isUser ? 'You' : 'Assistant'}
            </div>
            {msg.content}
          </div>
        );
      })}
    </div>
  );
}

function StreamingIndicator({ streaming }: { streaming: TurnStreamingState }) {
  const hasText = streaming.text.trim().length > 0;
  const hasStatus = (streaming.statusLog ?? '').trim().length > 0;
  const isBooting = streaming.sessionStatus === 'booting';

  if (hasText) {
    return (
      <div className="text-foreground/90 pl-2 text-[12px] whitespace-pre-wrap">
        <div className="text-muted-foreground/70 mb-0.5 text-[10px] font-medium tracking-wide uppercase">
          Assistant
        </div>
        {streaming.text}
        {hasStatus ? (
          <div className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-[10px] italic">
            <Loader2 className="h-3 w-3 animate-spin" />
            {streaming.statusLog}
          </div>
        ) : null}
      </div>
    );
  }

  if (hasStatus) {
    return (
      <div className="text-muted-foreground inline-flex items-center gap-1.5 pl-2 text-[11px] italic">
        <Loader2 className="h-3 w-3 animate-spin" />
        {streaming.statusLog}
      </div>
    );
  }

  if (streaming.awaiting || isBooting) {
    return (
      <div className="text-muted-foreground inline-flex items-center gap-1.5 pl-2 text-[11px] italic">
        <Loader2 className="h-3 w-3 animate-spin" />
        {isBooting ? 'Agent is waking up…' : 'Thinking…'}
      </div>
    );
  }

  return null;
}
