'use client';

/**
 * Live agent activity for the web (spec 149): the snapshot from
 * GET /api/agent-activity, re-read whenever the shared agent event stream
 * reports something and on a slow poll — agent questions and gate decisions
 * are not all notification events, so the poll is the safety net.
 *
 * No extra stream is opened: the app multiplexes one SSE connection for every
 * tab through a service worker, and this hook only listens to it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NotificationEventType } from '@shepai/core/domain/generated/output';
import { useAgentEventRefresh } from './use-agent-event-refresh';
import {
  agentActivityUrl,
  type AgentActivityQuery,
  type AgentActivitySnapshotView,
} from '@/lib/agent-activity-view';
import { errorMessage } from '@/lib/error-code';

/** Fallback re-read interval. */
export const AGENT_ACTIVITY_POLL_MS = 15_000;

const HTTP_NOT_FOUND = 404;
const ANY_EVENT: ReadonlySet<NotificationEventType> = new Set(Object.values(NotificationEventType));

export interface UseAgentActivityOptions extends AgentActivityQuery {
  pollMs?: number;
}

export interface UseAgentActivityResult {
  snapshot?: AgentActivitySnapshotView;
  /** True until the first read finishes. */
  loading: boolean;
  /** The last read's error; the previous snapshot stays. */
  error: string | null;
  /** True when `featureId` matched no feature. */
  notFound: boolean;
  refresh: () => Promise<void>;
}

export function useAgentActivity({
  featureId,
  includeSettled = false,
  pollMs = AGENT_ACTIVITY_POLL_MS,
}: UseAgentActivityOptions = {}): UseAgentActivityResult {
  const [snapshot, setSnapshot] = useState<AgentActivitySnapshotView>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const mountedRef = useRef(true);
  const url = agentActivityUrl({ featureId, includeSettled });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      const body = await response.json();
      if (!mountedRef.current) return;
      if (response.ok || response.status === HTTP_NOT_FOUND) {
        setSnapshot(body as AgentActivitySnapshotView);
        setNotFound(response.status === HTTP_NOT_FOUND);
        setError(null);
      } else {
        setError(typeof body?.error === 'string' ? body.error : response.statusText);
      }
    } catch (caught) {
      if (mountedRef.current) setError(errorMessage(caught));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), pollMs);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh, pollMs]);

  useAgentEventRefresh({ eventTypes: ANY_EVENT, onRefresh: () => void refresh() });

  return { snapshot, loading, error, notFound, refresh };
}
