'use client';

import { useEffect, useRef } from 'react';
import type {
  NotificationEvent,
  NotificationEventType,
} from '@shepai/core/domain/generated/output';
import { useOptionalAgentEventsContext } from './agent-events-provider';

/** Quiet period after the last relevant event before the page refreshes. */
export const AGENT_EVENT_REFRESH_DEBOUNCE_MS = 500;

export interface UseAgentEventRefreshOptions {
  /** Event types that change what the page renders. Pass a module-level constant. */
  eventTypes: ReadonlySet<NotificationEventType>;
  /** Re-reads the page's data — typically `router.refresh()`. */
  onRefresh: () => void;
  debounceMs?: number;
}

/**
 * Re-read a server-rendered page when the shared agent event stream reports
 * something it shows, coalescing a burst of events into one refresh.
 *
 * The cursor is the newest event already accounted for, matched by identity.
 * Two other cursors look simpler and are both wrong here:
 * - `lastEvent` alone drops a relevant event when an irrelevant one lands in
 *   the same render;
 * - a count (`events.length`) stops moving once `appendBounded` caps the list.
 *
 * It is seeded at mount, so the backlog the root-layout provider accumulated
 * before this page opened is never replayed as a refresh.
 */
export function useAgentEventRefresh({
  eventTypes,
  onRefresh,
  debounceMs = AGENT_EVENT_REFRESH_DEBOUNCE_MS,
}: UseAgentEventRefreshOptions): void {
  const events = useOptionalAgentEventsContext()?.events;
  const cursorRef = useRef<NotificationEvent | null>(events?.at(-1) ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const newest = events?.at(-1);
    if (!events || !newest || newest === cursorRef.current) return;

    // No cursor, or one pruned out of the bounded list (-1 + 1): scan everything retained.
    const cursor = cursorRef.current;
    const unseen = events.slice(cursor ? events.lastIndexOf(cursor) + 1 : 0);
    cursorRef.current = newest;
    if (!unseen.some((e) => eventTypes.has(e.eventType))) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onRefreshRef.current();
    }, debounceMs);
  }, [events, eventTypes, debounceMs]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );
}
