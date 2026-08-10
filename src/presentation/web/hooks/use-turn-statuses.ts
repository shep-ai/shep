'use client';

import { useEffect, useRef, useCallback } from 'react';
import { create } from 'zustand';

export type TurnStatus = 'idle' | 'processing' | 'unread' | 'awaiting_input';

interface TurnStatusStore {
  statuses: Record<string, TurnStatus>;
  setStatuses: (statuses: Record<string, TurnStatus>) => void;
  updateStatus: (featureId: string, status: TurnStatus) => void;
}

const useTurnStatusStore = create<TurnStatusStore>((set) => ({
  statuses: {},
  setStatuses: (statuses) => set({ statuses }),
  updateStatus: (featureId, turnStatus) =>
    set((state) => {
      const prev = state.statuses;
      // Drop idle entries to match the GET endpoint's "non-idle only"
      // contract — keeps the map lean.
      if (turnStatus === 'idle') {
        if (!(featureId in prev)) return state;
        const next = { ...prev };
        delete next[featureId];
        return { statuses: next };
      }
      if (prev[featureId] === turnStatus) return state;
      return { statuses: { ...prev, [featureId]: turnStatus } };
    }),
}));

/**
 * Event-driven global turn-status listener.
 * Should be mounted once globally (e.g. in TurnStatusesProvider).
 *
 * - On mount: ONE-SHOT GET /api/interactive/chat/turn-statuses to seed
 *   the initial snapshot.
 * - After that: live updates via EventSource on
 *   /api/interactive/chat/turn-statuses/stream, which emits a
 *   `turn_status` event for every active session's turn transition.
 * - Robustness: the browser auto-reconnects EventSource on drops; on
 *   every successful (re)connect we re-run the snapshot fetch to catch
 *   any events missed during the downtime.
 */
export function useTurnStatusSync(): void {
  const { setStatuses, updateStatus } = useTurnStatusStore();
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
  }, [setStatuses]);

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
        updateStatus(featureId, turnStatus);
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
  }, [fetchSnapshot, updateStatus]);
}

/**
 * Get the turn status for a specific scope ID.
 * Subscribes to only this scope ID's changes.
 */
export function useTurnStatus(scopeId: string): TurnStatus {
  return useTurnStatusStore((state) => state.statuses[scopeId] ?? 'idle');
}

/**
 * Marks a feature's chat as read (clears 'unread' → 'idle').
 */
export async function markChatRead(featureId: string): Promise<void> {
  await fetch(`/api/interactive/chat/${featureId}/mark-read`, { method: 'POST' });
}
