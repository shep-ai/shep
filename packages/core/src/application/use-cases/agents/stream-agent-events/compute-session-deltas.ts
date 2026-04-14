/**
 * Pure helper: compute interactive-session lifecycle deltas.
 *
 * Takes the full list of currently-active sessions plus a `fetchById` lookup
 * (so the orchestrator can inject the repository call) and returns:
 * - Events for active sessions whose status changed.
 * - Events for sessions that transitioned out of active state — those come
 *   via an async `findById` lookup so the caller controls the repo access.
 *
 * Mutates `sessionCache` in place.
 */

import type { InteractiveSession } from '../../../../domain/generated/output.js';
import { InteractiveSessionStatus } from '../../../../domain/generated/output.js';

import type { CachedSessionState, StreamedAgentEvent } from './stream-agent-events.types.js';
import { statusToInteractiveEventType } from './stream-agent-events.types.js';

export interface ComputeSessionDeltasArgs {
  activeSessions: InteractiveSession[];
  sessionCache: Map<string, CachedSessionState>;
  fetchById: (sessionId: string) => Promise<InteractiveSession | null>;
}

export async function computeSessionDeltas(
  args: ComputeSessionDeltasArgs
): Promise<StreamedAgentEvent[]> {
  const { activeSessions, sessionCache, fetchById } = args;
  const events: StreamedAgentEvent[] = [];

  for (const session of activeSessions) {
    const prev = sessionCache.get(session.id);
    if (prev?.status !== session.status) {
      sessionCache.set(session.id, { status: session.status });
      events.push({
        kind: 'interactive-session',
        type: statusToInteractiveEventType(session.status),
        sessionId: session.id,
        featureId: session.featureId,
      });
    }
  }

  // Sessions that disappeared from the active list — fetch final status.
  for (const [sessionId, cached] of sessionCache) {
    const stillActive = activeSessions.find((s) => s.id === sessionId);
    const wasActive =
      cached.status === InteractiveSessionStatus.booting ||
      cached.status === InteractiveSessionStatus.ready;
    if (wasActive && !stillActive) {
      const session = await fetchById(sessionId);
      if (session) {
        sessionCache.set(sessionId, { status: session.status });
        events.push({
          kind: 'interactive-session',
          type: statusToInteractiveEventType(session.status),
          sessionId: session.id,
          featureId: session.featureId,
        });
      } else {
        sessionCache.delete(sessionId);
      }
    }
  }

  return events;
}
