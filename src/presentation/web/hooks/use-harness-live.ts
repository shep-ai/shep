'use client';

import { useEffect, useRef } from 'react';

/** Coalesce bursts of events (a turn emits several) into one refresh. */
const REFRESH_DEBOUNCE_MS = 400;

/**
 * Follow a harness session's events over SSE (spec 119) and call `onChange`
 * (debounced) whenever something happens. Disabled when sessionId is null.
 */
export function useHarnessLive(sessionId: string | null, onChange: () => void): void {
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (!sessionId || typeof EventSource === 'undefined') return;
    const source = new EventSource(
      `/api/harness-events?sessionId=${encodeURIComponent(sessionId)}`
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    source.addEventListener('harness', () => {
      // The first batch replays history the page already rendered.
      if (first) {
        first = false;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => callback.current(), REFRESH_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      source.close();
    };
  }, [sessionId]);
}
