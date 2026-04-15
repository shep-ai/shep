/**
 * GetChatTurnGroupsUseCase
 *
 * Server-side derivation of "user turn groups" for the chat thread.
 *
 * The raw interactive_messages table is a flat, append-only log of
 * user/assistant pairs. The chat UI wants to collapse every COMPLETED
 * user turn into a single named card ("Working on: …") so the thread
 * doesn't become an endless scroll of raw bubbles — but the MOST
 * RECENT turn must stay live so the user keeps seeing the reply that
 * is actively streaming in response to what they just typed.
 *
 * Grouping rules:
 *   1. Ignore messages that carry a `stepId` — those are setup-workflow
 *      messages and live inside the StepTracker, not the flat thread.
 *   2. Walk the remaining messages in chronological order. Every user
 *      message opens a new turn; every subsequent assistant message is
 *      attached to the open turn until the next user message.
 *   3. The LAST turn is never grouped (it is the live turn).
 *   4. `hiddenMessageIds` lists every message id that a client should
 *      FILTER OUT of the flat thread render — the client then draws
 *      a collapsible group card in its place.
 *
 * This use case is read-only. It speaks exclusively to the
 * IInteractiveMessageRepository port, so presentation layers can ask
 * for groups without any coupling to the underlying SQLite schema.
 *
 * Feature: application-chat turn grouping (see spec in CLAUDE memo).
 */

import { inject, injectable } from 'tsyringe';
import type { IInteractiveMessageRepository } from '../../ports/output/repositories/interactive-message-repository.interface.js';
import type { InteractiveMessage } from '../../../domain/generated/output.js';
import { InteractiveMessageRole } from '../../../domain/generated/output.js';

/** One user-turn group, ready for the client to render as a card. */
export interface ChatTurnGroup {
  /** Stable id derived from the first (user) message id in the turn. */
  id: string;
  /** User-facing title, e.g. "Working on: Fix login bug". */
  title: string;
  /** Trimmed preview of the user message text, capped to PREVIEW_MAX. */
  userMessagePreview: string;
  /** Message ids that belong to this turn, in order. */
  messageIds: string[];
  /** Number of assistant replies collected inside the turn. */
  assistantMessageCount: number;
  /** When the user message was written (epoch ms). */
  startedAt: number;
  /** When the last message in the turn was written (epoch ms). */
  endedAt: number;
  /**
   * `completed` for everything the client should collapse by default.
   * `in-progress` is reserved for `currentTurn` — the most recent
   * user turn, which the client renders as an expanded "Working on
   * your request…" card with the live streaming indicator inside it.
   */
  status: 'completed' | 'in-progress';
}

export interface GetChatTurnGroupsInput {
  featureId: string;
}

export interface GetChatTurnGroupsResult {
  /** Completed turn groups in chronological order. */
  groups: ChatTurnGroup[];
  /**
   * The most recent user-initiated turn, always `status: 'in-progress'`
   * when present. The client renders this as an expanded card with
   * the streaming indicator pinned inside it, so a new "Working on
   * your request…" surface appears the instant the user sends a
   * message — no flat "Thinking…" bubble in the thread. Null when
   * the feature has no user-initiated turns yet (e.g. only setup
   * messages exist).
   */
  currentTurn: ChatTurnGroup | null;
  /**
   * Every message id that belongs to a returned group — completed
   * groups AND the current turn. The UI filters these out of the raw
   * thread so nothing renders twice.
   */
  hiddenMessageIds: string[];
}

const PREVIEW_MAX = 120;
const TITLE_MAX = 140;
const FALLBACK_TITLE = 'Working on your request';

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

@injectable()
export class GetChatTurnGroupsUseCase {
  constructor(
    @inject('IInteractiveMessageRepository')
    private readonly messages: IInteractiveMessageRepository
  ) {}

  async execute(input: GetChatTurnGroupsInput): Promise<GetChatTurnGroupsResult> {
    const all = await this.messages.findByFeatureId(input.featureId);

    // Setup-workflow messages live inside the StepTracker — never
    // part of the flat-thread turn grouping.
    const flat = all.filter((m) => !m.stepId);
    if (flat.length === 0) {
      return { groups: [], currentTurn: null, hiddenMessageIds: [] };
    }

    // Walk in chronological order and bucket into turns. A turn opens
    // on every user message; the assistant replies that immediately
    // follow get attached to it until the next user message opens a
    // new turn.
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
      // If we see an assistant message with NO open turn, it is an
      // orphan (very rare — only possible from out-of-order writes).
      // Drop it silently: it would not belong to any grouped card and
      // forcing it into one would be misleading.
    }

    if (turns.length === 0) {
      return { groups: [], currentTurn: null, hiddenMessageIds: [] };
    }

    // The final turn is the "current" one — the user's most recent
    // ask, which the client renders as an expanded in-progress card
    // with the live streaming indicator pinned inside it. Everything
    // before it is a completed group the client collapses by default.
    const completed = turns.slice(0, -1);
    const latest = turns[turns.length - 1];

    const completedGroups: ChatTurnGroup[] = completed.map((t) => buildGroup(t, 'completed'));
    const currentTurn: ChatTurnGroup = buildGroup(latest, 'in-progress');

    const hiddenMessageIds = [
      ...completedGroups.flatMap((g) => g.messageIds),
      ...currentTurn.messageIds,
    ];
    return { groups: completedGroups, currentTurn, hiddenMessageIds };
  }
}

function buildGroup(
  t: { user: InteractiveMessage; items: InteractiveMessage[] },
  status: 'completed' | 'in-progress'
): ChatTurnGroup {
  const first = t.items[0];
  const last = t.items[t.items.length - 1];
  const userText = t.user.content ?? '';
  const assistantMessageCount = t.items.filter(
    (m) => m.role === InteractiveMessageRole.assistant
  ).length;
  return {
    id: `turn-${t.user.id}`,
    title: buildTitle(userText),
    userMessagePreview: truncate(userText.trim().replace(/\s+/g, ' '), PREVIEW_MAX),
    messageIds: t.items.map((m) => m.id),
    assistantMessageCount,
    startedAt: toEpochMs(first.createdAt),
    endedAt: toEpochMs(last.createdAt),
    status,
  };
}
