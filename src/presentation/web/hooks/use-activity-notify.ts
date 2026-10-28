'use client';

/**
 * "Notify me" (spec 149): the web's `shep feat wait`. Waits on
 * GET /api/agent-activity/wait — WaitForAgentActivityUseCase decides — and asks
 * again each time a wait times out, until the feature matches, the wait fails,
 * the caller stops, or the component unmounts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityWaitOutcome, type AgentActivityState } from '@shepai/core/domain/generated/output';
import {
  agentActivityWaitUrl,
  type ActivityWaitResultView,
  type AgentActivityView,
} from '@/lib/agent-activity-view';
import { errorMessage } from '@/lib/error-code';

export interface UseActivityNotifyOptions {
  featureId: string;
  /** States to wait for; the use case's default (blocked, done, failed) when absent. */
  until?: readonly AgentActivityState[];
  /** Called once with the matching activity. */
  onMatch: (activity: AgentActivityView) => void;
}

export interface UseActivityNotifyResult {
  watching: boolean;
  /** Why the last wait stopped without a match: an outcome or an error message. */
  error: string | null;
  start: () => void;
  stop: () => void;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useActivityNotify({
  featureId,
  until,
  onMatch,
}: UseActivityNotifyOptions): UseActivityNotifyResult {
  const [watching, setWatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const onMatchRef = useRef(onMatch);

  useEffect(() => {
    onMatchRef.current = onMatch;
  }, [onMatch]);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setWatching(false);
  }, []);

  const start = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setWatching(true);
    setError(null);

    const url = agentActivityWaitUrl(featureId, until);
    const loop = async () => {
      for (;;) {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        const result = (await response.json()) as ActivityWaitResultView;
        if (result.outcome === ActivityWaitOutcome.TimedOut) continue;
        if (result.outcome === ActivityWaitOutcome.Matched && result.activity) {
          onMatchRef.current(result.activity);
          return null;
        }
        return result.outcome ?? response.statusText;
      }
    };

    loop()
      .then((failure) => {
        if (controller.signal.aborted) return;
        setError(failure);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || isAbort(caught)) return;
        setError(errorMessage(caught));
      })
      .finally(() => {
        if (controllerRef.current !== controller) return;
        controllerRef.current = null;
        setWatching(false);
      });
  }, [featureId, until]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { watching, error, start, stop };
}
