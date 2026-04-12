'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export type TurnStatus = 'idle' | 'processing' | 'unread' | 'awaiting_input';

/**
 * Event-driven global turn-status map.
 *
 * - On mount: ONE-SHOT GET /api/interactive/chat/turn-statuses to seed
 *   the initial snapshot. Replaces the old 2-second polling loop.
 * - After that: live updates via EventSource on
 *   /api/interactive/chat/turn-statuses/stream, which emits a
 *   `turn_status` event for every active session's turn transition.
 * - Robustness: the browser auto-reconnects EventSource on drops; on
 *   every successful (re)connect we re-run the snapshot fetch to catch
 *   any events missed during the downtime.
 *
 * No periodic polling. One request per page load plus one SSE
 * connection per tab.
 */
export function useAllTurnStatuses(): Record<string, TurnStatus> {
  const [statuses, setStatuses] = useState<Record<string, TurnStatus>>({});
  const mountedRef = useRef(true);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/interactive/chat/turn-statuses');
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, TurnStatus>;
      if (mountedRef.current) setStatuses(data);
    } catch {
      // Transient network blip — ignore; the SSE open handler will
      // retry the snapshot on reconnect.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Initial snapshot
    void fetchSnapshot();

    // Live updates
    const es = new EventSource('/api/interactive/chat/turn-statuses/stream');

    es.addEventListener('turn_status', (event: MessageEvent) => {
      try {
        const { featureId, turnStatus } = JSON.parse(event.data as string) as {
          featureId: string;
          turnStatus: TurnStatus;
        };
        if (!featureId || !turnStatus) return;
        setStatuses((prev) => {
          // Drop idle entries to match the GET endpoint's "non-idle only"
          // contract — keeps the map lean and the equality check in
          // TurnStatusesProvider cheap.
          if (turnStatus === 'idle') {
            if (!(featureId in prev)) return prev;
            const next = { ...prev };
            delete next[featureId];
            return next;
          }
          if (prev[featureId] === turnStatus) return prev;
          return { ...prev, [featureId]: turnStatus };
        });
      } catch {
        // Ignore malformed events
      }
    });

    // Re-sync on every successful (re)connect so any events missed
    // during a disconnect are recovered. First open is idempotent.
    es.addEventListener('open', () => {
      void fetchSnapshot();
    });

    es.onerror = () => {
      // Browser auto-reconnects; the `open` listener refetches on recovery.
    };

    return () => {
      mountedRef.current = false;
      es.close();
    };
  }, [fetchSnapshot]);

  return statuses;
}

/**
 * Marks a feature's chat as read (clears 'unread' → 'idle').
 */
export async function markChatRead(featureId: string): Promise<void> {
  await fetch(`/api/interactive/chat/${featureId}/mark-read`, { method: 'POST' });
}
