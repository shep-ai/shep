'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PmEvent, PmEventType } from '@/app/api/pm-events/route';

export type PmConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface UsePmEventsOptions {
  projectId: string;
  /** Optional filter to only receive specific event types */
  eventTypes?: PmEventType[];
  /** Called when any PM event is received */
  onEvent?: (event: PmEvent) => void;
}

export interface UsePmEventsResult {
  events: PmEvent[];
  lastEvent: PmEvent | null;
  connectionStatus: PmConnectionStatus;
}

const MAX_EVENTS = 200;
const PRUNE_KEEP = 100;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Hook that receives real-time project management events via SSE.
 *
 * Connects directly to /api/pm-events?projectId=... and receives
 * work item, cycle, and module change events. Automatically reconnects
 * on disconnect with exponential backoff.
 */
export function usePmEvents({
  projectId,
  eventTypes,
  onEvent,
}: UsePmEventsOptions): UsePmEventsResult {
  const [events, setEvents] = useState<PmEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<PmEvent | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<PmConnectionStatus>('disconnected');

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const eventTypesKey = eventTypes?.sort().join(',') ?? '';

  const connect = useCallback(() => {
    if (typeof window === 'undefined' || !projectId) return;

    // Clean up existing connection
    eventSourceRef.current?.close();

    setConnectionStatus('connecting');
    const es = new EventSource(`/api/pm-events?projectId=${encodeURIComponent(projectId)}`);
    eventSourceRef.current = es;

    es.addEventListener('pm_event', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as PmEvent;

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
  }, [projectId, eventTypesKey]);

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
