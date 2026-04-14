/**
 * Stream Event Dispatcher
 *
 * Pure pub/sub fan-out for interactive session stream chunks. Owns two
 * subscriber maps:
 *
 * 1. `featureSubscribers` — per-feature subscribers that survive session
 *    restarts (SSE connections live here so they keep receiving events
 *    from a freshly-booted session after the old one died).
 * 2. `globalSubscribers`  — subscribers that receive every chunk from
 *    every session tagged with its feature scope key. Used by the
 *    global turn-status SSE endpoint so the sidebar can track all
 *    active sessions without polling.
 *
 * Session-level subscribers still live on `SessionState.subscribers`
 * (they're tied to session lifetime), and `notify(state, chunk)` reads
 * them off the state passed in. The injected `SessionRegistry` dep is
 * reserved for `subscribeSession` which must resolve the state by id.
 *
 * No DB, no persistence, no logging. Just subscriber lists.
 */

import type {
  StreamChunk,
  UnsubscribeFn,
} from '../../../../application/ports/output/services/interactive-session-service.interface.js';
import type { SessionRegistry, SessionState } from './session-registry.js';

type SessionChunkHandler = (chunk: StreamChunk) => void;
type GlobalChunkHandler = (featureId: string, chunk: StreamChunk) => void;

export class StreamEventDispatcher {
  private readonly featureSubscribers = new Map<string, Set<SessionChunkHandler>>();
  private readonly globalSubscribers = new Set<GlobalChunkHandler>();

  constructor(private readonly registry: SessionRegistry) {}

  /**
   * Subscribe to a specific live session by sessionId. The callback is
   * appended to the `SessionState.subscribers` set and is removed when
   * the session is deleted from the registry (session-bound lifetime).
   */
  subscribeSession(sessionId: string, onChunk: SessionChunkHandler): UnsubscribeFn {
    const state = this.registry.get(sessionId);
    if (!state) {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      return () => {};
    }
    state.subscribers.add(onChunk);
    return () => state.subscribers.delete(onChunk);
  }

  /**
   * Subscribe at the feature level so the callback survives session
   * restarts. When a session dies (idle timeout, error) and a new one
   * boots, SSE connections subscribed here keep receiving events from
   * the new session automatically.
   */
  subscribeByFeature(featureId: string, onChunk: SessionChunkHandler): UnsubscribeFn {
    let subs = this.featureSubscribers.get(featureId);
    if (!subs) {
      subs = new Set();
      this.featureSubscribers.set(featureId, subs);
    }
    subs.add(onChunk);
    return () => {
      subs!.delete(onChunk);
      if (subs!.size === 0) {
        this.featureSubscribers.delete(featureId);
      }
    };
  }

  /**
   * Subscribe to every chunk emitted by every session, tagged with the
   * feature scope key so the consumer can multiplex across all active
   * sessions (global turn-status SSE endpoint).
   */
  subscribeAll(onChunk: GlobalChunkHandler): UnsubscribeFn {
    this.globalSubscribers.add(onChunk);
    return () => {
      this.globalSubscribers.delete(onChunk);
    };
  }

  /**
   * Dispatch a chunk to all subscribers for a session — session-level,
   * feature-level, and global. Use whenever `SessionState` is in scope.
   */
  notify(state: SessionState, chunk: StreamChunk): void {
    state.subscribers.forEach((sub) => sub(chunk));
    const featureSubs = this.featureSubscribers.get(state.featureId);
    if (featureSubs) {
      featureSubs.forEach((sub) => sub(chunk));
    }
    this.globalSubscribers.forEach((sub) => sub(state.featureId, chunk));
  }

  /**
   * Dispatch a chunk to feature-level subscribers and global subscribers
   * only, for cases where no in-memory session state is available
   * (e.g. while persisting the user message before cold-boot — session
   * subscribers don't exist yet at that point).
   */
  notifyByFeatureId(featureId: string, chunk: StreamChunk): void {
    const featureSubs = this.featureSubscribers.get(featureId);
    if (featureSubs) {
      featureSubs.forEach((sub) => sub(chunk));
    }
    this.globalSubscribers.forEach((sub) => sub(featureId, chunk));
  }
}
