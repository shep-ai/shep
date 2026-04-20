'use client';

/**
 * TurnGroupList
 *
 * Renders user-turn groups as collapsible cards in chronological
 * order. Grouping is computed CLIENT-SIDE from the raw messages
 * exposed by `useChatRuntime` so the view is always optimistic:
 * the moment a new message hits the chat-state cache via SSE, the
 * useMemo re-runs and the card appears — no stale-query race
 * window where the flat thread briefly shows raw bubbles.
 *
 * The server-side `GetChatTurnGroupsUseCase` still owns the
 * canonical grouping shape and is used by other clients (CLI, TUI,
 * external API consumers); the web keeps a second implementation
 * here only to avoid the network round-trip for its own render.
 */

import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { InteractiveMessage } from '@shepai/core/domain/generated/output';
import { InteractiveMessageRole } from '@shepai/core/domain/generated/output';
import { TurnGroupCard } from './turn-group-card';

export interface TurnGroupView {
  id: string;
  title: string;
  userMessagePreview: string;
  messageIds: string[];
  assistantMessageCount: number;
  startedAt: number;
  endedAt: number;
  status: 'completed' | 'in-progress';
}

export interface TurnGroupsView {
  groups: TurnGroupView[];
  currentTurn: TurnGroupView | null;
  hiddenMessageIds: string[];
}

const PREVIEW_MAX = 120;
const TITLE_MAX = 140;
const FALLBACK_TITLE = 'Working on your request';

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function buildTitle(userText: string): string {
  const cleaned = userText.trim().replace(/\s+/g, ' ');
  if (cleaned.length === 0) return FALLBACK_TITLE;
  const preview = truncate(cleaned, PREVIEW_MAX);
  return truncate(`Working on: ${preview}`, TITLE_MAX);
}

function toEpochMs(raw: unknown): number {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) return asNum;
    const parsed = new Date(raw).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Client-side turn grouping — mirrors
 * `GetChatTurnGroupsUseCase` so the web view has no stale-query
 * window. Step-tagged messages are ignored (they live inside the
 * StepTracker). Every non-step-tagged user message opens a new
 * turn; the subsequent non-step assistant messages attach to it
 * until the next user message.
 *
 * The LATEST turn becomes `currentTurn` (status `in-progress`)
 * ONLY when `isAgentBusy` is true — i.e. the chat runtime reports
 * live streaming, tool activity, or a pending-response awaiting
 * state. Otherwise the latest turn is demoted to `completed` so a
 * finished conversation doesn't leave a permanent "Working on
 * your request…" card pretending work is still happening.
 */
export function computeTurnGroupsFromMessages(
  messages: readonly InteractiveMessage[],
  isAgentBusy = true
): TurnGroupsView {
  const flat = messages.filter((m) => !m.stepId);
  if (flat.length === 0) {
    return { groups: [], currentTurn: null, hiddenMessageIds: [] };
  }

  interface Turn {
    user: InteractiveMessage;
    items: InteractiveMessage[];
  }
  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const m of flat) {
    if (m.role === InteractiveMessageRole.user) {
      current = { user: m, items: [m] };
      turns.push(current);
    } else if (current) {
      current.items.push(m);
    }
  }
  if (turns.length === 0) {
    return { groups: [], currentTurn: null, hiddenMessageIds: [] };
  }

  const toView = (t: Turn, status: 'completed' | 'in-progress'): TurnGroupView => {
    const first = t.items[0];
    const last = t.items[t.items.length - 1];
    const userText = t.user.content ?? '';
    return {
      id: `turn-${t.user.id}`,
      title: buildTitle(userText),
      userMessagePreview: truncate(userText.trim().replace(/\s+/g, ' '), PREVIEW_MAX),
      messageIds: t.items.map((m) => m.id),
      assistantMessageCount: t.items.filter((m) => m.role === InteractiveMessageRole.assistant)
        .length,
      startedAt: toEpochMs(first.createdAt),
      endedAt: toEpochMs(last.createdAt),
      status,
    };
  };

  const latest = turns[turns.length - 1];
  if (isAgentBusy) {
    // Agent is actively working — the latest turn is the live one
    // and owns the in-progress fuchsia card.
    const completed = turns.slice(0, -1).map((t) => toView(t, 'completed'));
    const currentTurn = toView(latest, 'in-progress');
    const hiddenMessageIds = [...completed.flatMap((g) => g.messageIds), ...currentTurn.messageIds];
    return { groups: completed, currentTurn, hiddenMessageIds };
  }

  // Agent is idle — every turn (including the most recent) is
  // completed. No in-progress card; the timeline stays chronological
  // with the latest turn at the tail as a collapsible emerald card.
  const completed = turns.map((t) => toView(t, 'completed'));
  const hiddenMessageIds = completed.flatMap((g) => g.messageIds);
  return { groups: completed, currentTurn: null, hiddenMessageIds };
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
 * useTurnGroupsView — the client-side grouping hook consumed by
 * `CurrentTurnCard` and `CompletedTurnGroupsList`. It folds the raw
 * message stream into the same shape the server use case returns,
 * but runs on every render so the UI is always optimistic against
 * the chat-state cache (no stale-query window).
 *
 * `isAgentBusy` controls whether the latest turn gets promoted to
 * `currentTurn` (in-progress fuchsia card) or stays as the last
 * `completed` card in the chronological list. Pass the chat
 * runtime's `status.isRunning` flag so finished conversations
 * never leave a stale "Working on your request…" surface pinned.
 */
export function useTurnGroupsView(
  messages: readonly InteractiveMessage[],
  isAgentBusy: boolean
): TurnGroupsView {
  return useMemo(
    () => computeTurnGroupsFromMessages(messages, isAgentBusy),
    [messages, isAgentBusy]
  );
}

export interface CurrentTurnCardProps {
  /** Pre-computed groups view (from `useTurnGroupsView`). */
  view: TurnGroupsView;
  /** Raw messages, used to hydrate the card children. */
  allMessages: readonly InteractiveMessage[];
  /** Live streaming state pinned at the bottom of the card. */
  streaming: TurnStreamingState;
}

/**
 * The in-progress "Working on your request…" card for the latest
 * user turn. Always renders at the chronological tail of the
 * timeline — never pinned at the top — so the conversation reads
 * top-to-bottom: setup → completed turns → current turn.
 */
export function CurrentTurnCard({ view, allMessages, streaming }: CurrentTurnCardProps) {
  if (!view.currentTurn) return null;
  const byId = new Map<string, InteractiveMessage>();
  for (const m of allMessages) byId.set(m.id, m);

  // Default surface: ONLY the user message + a high-level friendly
  // streaming indicator. Raw assistant / tool bubbles never appear
  // here — that's the rule in features/chat/CLAUDE.md. They live
  // behind the chevron inside `details`.
  const userMessageId = view.currentTurn.messageIds.find((mid) => {
    const m = byId.get(mid);
    return m?.role === InteractiveMessageRole.user;
  });
  const userMessage = userMessageId ? byId.get(userMessageId) : null;

  const condensed = (
    <div className="flex flex-col gap-2">
      {userMessage ? (
        <div className="text-foreground border-l-2 border-violet-500/50 pl-2 text-[12px] whitespace-pre-wrap">
          <div className="text-muted-foreground/70 mb-0.5 text-[10px] font-medium tracking-wide uppercase">
            You
          </div>
          {userMessage.content}
        </div>
      ) : null}
      {/* Condensed indicator — never the raw assistant stream. Only
          a high-level activity line (tool status, "Thinking…", or
          "Agent is waking up…") so the card obeys the layer rule:
          by default the card shows only the user request and a
          friendly live-activity line. Expand the chevron to see the
          raw assistant content. */}
      <CondensedStreamingIndicator streaming={streaming} />
    </div>
  );

  const details = (
    <div className="flex flex-col gap-2">
      <TurnChildMessages messageIds={view.currentTurn.messageIds} byId={byId} />
      <StreamingIndicator streaming={streaming} />
    </div>
  );

  return (
    <TurnGroupCard
      id={view.currentTurn.id}
      title={view.currentTurn.title}
      status="in-progress"
      assistantMessageCount={view.currentTurn.assistantMessageCount}
      condensed={condensed}
      details={details}
    />
  );
}

/**
 * Renders a SINGLE turn group (completed or in-progress) as a
 * standalone card. Used by `ChatTab` when it builds the unified
 * chronological timeline — the timeline interleaves user turns
 * with publish/deploy operation bubbles by `startedAt`, so each
 * turn has to be renderable on its own at an arbitrary position.
 *
 * The in-progress variant requires `streaming` so the live card
 * keeps its condensed "Thinking…" / "Working…" indicator. When the
 * agent finishes, the caller flips `status` to `completed` on the
 * SAME turn id and the card stays in place — React key stability
 * ensures no unmount / remount, matching the user's expectation
 * that "Working on" becomes a completed card without relocating.
 */
export function SingleTurnCard({
  group,
  allMessages,
  streaming,
}: {
  group: TurnGroupView;
  allMessages: readonly InteractiveMessage[];
  streaming?: TurnStreamingState;
}) {
  const byId = new Map<string, InteractiveMessage>();
  for (const m of allMessages) byId.set(m.id, m);
  const isInProgress = group.status === 'in-progress';

  if (!isInProgress) {
    return (
      <TurnGroupCard
        id={group.id}
        title={group.title}
        status="completed"
        assistantMessageCount={group.assistantMessageCount}
      >
        <TurnChildMessages messageIds={group.messageIds} byId={byId} />
      </TurnGroupCard>
    );
  }

  // In-progress — condensed default + details behind chevron.
  const userMessageId = group.messageIds.find((mid) => {
    const m = byId.get(mid);
    return m?.role === InteractiveMessageRole.user;
  });
  const userMessage = userMessageId ? byId.get(userMessageId) : null;
  const condensed = (
    <div className="flex flex-col gap-2">
      {userMessage ? (
        <div className="text-foreground border-l-2 border-violet-500/50 pl-2 text-[12px] whitespace-pre-wrap">
          <div className="text-muted-foreground/70 mb-0.5 text-[10px] font-medium tracking-wide uppercase">
            You
          </div>
          {userMessage.content}
        </div>
      ) : null}
      {streaming ? <CondensedStreamingIndicator streaming={streaming} /> : null}
    </div>
  );
  const details = (
    <div className="flex flex-col gap-2">
      <TurnChildMessages messageIds={group.messageIds} byId={byId} />
      {streaming ? <StreamingIndicator streaming={streaming} /> : null}
    </div>
  );
  return (
    <TurnGroupCard
      id={group.id}
      title={group.title}
      status="in-progress"
      assistantMessageCount={group.assistantMessageCount}
      condensed={condensed}
      details={details}
    />
  );
}

export interface CompletedTurnGroupsListProps {
  /** Pre-computed groups view (from `useTurnGroupsView`). */
  view: TurnGroupsView;
  /** Raw messages, used to hydrate card children. */
  allMessages: readonly InteractiveMessage[];
}

/**
 * The list of COMPLETED, collapsed-by-default turn group cards.
 * Rendered chronologically between the StepTracker and the
 * in-progress card so the whole conversation reads top-to-bottom.
 */
export function CompletedTurnGroupsList({ view, allMessages }: CompletedTurnGroupsListProps) {
  if (view.groups.length === 0) return null;
  const byId = new Map<string, InteractiveMessage>();
  for (const m of allMessages) byId.set(m.id, m);

  return (
    // `shrink-0` cascades: the outer wrapper must also refuse to
    // shrink so its child cards keep their intrinsic height inside
    // the ThreadPrimitive.Viewport flex column.
    <div className="flex shrink-0 flex-col">
      {view.groups.map((g) => (
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

/**
 * High-level activity line rendered inside the in-progress turn
 * card's DEFAULT (collapsed) surface. Strict rule: never show the
 * raw assistant stream — only a spinner plus a friendly status
 * (tool activity, "Thinking…", or "Working…"). Raw assistant
 * content lives behind the chevron. See `CLAUDE.md` in this
 * directory for the layered contract.
 */
function CondensedStreamingIndicator({ streaming }: { streaming: TurnStreamingState }) {
  const hasStatus = (streaming.statusLog ?? '').trim().length > 0;
  const hasText = streaming.text.trim().length > 0;
  const isBooting = streaming.sessionStatus === 'booting';

  // Fallback label priority: tool status → "Thinking…" while
  // awaiting the first delta / booting → "Working…" whenever raw
  // text is streaming but we refuse to show it here.
  let label: string;
  if (hasStatus) {
    label = streaming.statusLog ?? 'Working…';
  } else if (streaming.awaiting || isBooting) {
    label = isBooting ? 'Agent is waking up…' : 'Thinking…';
  } else if (hasText) {
    label = 'Working…';
  } else {
    return null;
  }

  return (
    <div className="text-muted-foreground inline-flex items-center gap-1.5 pl-2 text-[11px] italic">
      <Loader2 className="h-3 w-3 animate-spin" />
      {label}
    </div>
  );
}
