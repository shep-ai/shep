'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SdlcEvent, SdlcEventType } from '@/app/api/sdlc-events/route';

export type SdlcConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface UseSdlcEventsOptions {
  /** Optional feature ID to scope events to a single feature/epic */
  featureId?: string;
  /** Optional filter to only receive specific event types */
  eventTypes?: SdlcEventType[];
  /** Called when any SDLC event is received */
  onEvent?: (event: SdlcEvent) => void;
}

export interface UseSdlcEventsResult {
  events: SdlcEvent[];
  lastEvent: SdlcEvent | null;
  connectionStatus: SdlcConnectionStatus;
}

const MAX_EVENTS = 200;
const PRUNE_KEEP = 100;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Hook that receives real-time SDLC task and sub-task events via SSE.
 *
 * Connects to /api/sdlc-events (optionally scoped to a featureId) and
 * receives task/sub-task create, update, and delete events. Automatically
 * reconnects on disconnect with exponential backoff.
 */
export function useSdlcEvents({
  featureId,
  eventTypes,
  onEvent,
}: UseSdlcEventsOptions): UseSdlcEventsResult {
  const [events, setEvents] = useState<SdlcEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<SdlcEvent | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<SdlcConnectionStatus>('disconnected');

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const eventTypesKey = eventTypes?.sort().join(',') ?? '';

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Clean up existing connection
    eventSourceRef.current?.close();

    setConnectionStatus('connecting');

    const params = new URLSearchParams();
    if (featureId) {
      params.set('featureId', featureId);
    }
    const query = params.toString();
    const url = `/api/sdlc-events${query ? `?${query}` : ''}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('sdlc_event', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as SdlcEvent;

        // Apply event type filter if specified
        if (eventTypesKey && !eventTypesKey.includes(parsed.eventType)) {
          return;
        }

        setEvents((prev) => {
          const next = [...prev, parsed];
          return next.length > MAX_EVENTS ? next.slice(-PRUNE_KEEP) : next;
        });
        setLastEvent(parsed);
        onEventRef.current?.(parsed);
      } catch {
        // Ignore malformed events
      }
    });

    es.onopen = () => {
      setConnectionStatus('connected');
      retryCountRef.current = 0;
    };

    es.onerror = () => {
      es.close();
      setConnectionStatus('disconnected');

      // Exponential backoff reconnection
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, retryCountRef.current),
        RECONNECT_MAX_MS
      );
      retryCountRef.current++;
      retryTimeoutRef.current = setTimeout(connect, delay);
    };
  }, [featureId, eventTypesKey]);

  useEffect(() => {
    connect();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [connect]);

  return { events, lastEvent, connectionStatus };
}
