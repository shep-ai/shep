/**
 * StreamEventDispatcher Unit Tests
 *
 * Pure pub/sub — reads session subscribers from an injected SessionRegistry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  SessionRegistry,
  type SessionState,
} from '@/infrastructure/services/interactive/core/session-registry.js';
import { StreamEventDispatcher } from '@/infrastructure/services/interactive/core/stream-event-dispatcher.js';
import type { StreamChunk } from '@/application/ports/output/services/interactive-session-service.interface.js';

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sess-1',
    featureId: 'feat-1',
    worktreePath: '/repo/wt',
    handle: null,
    currentAssistantBuffer: '',
    toolEventsLog: [],
    subscribers: new Set(),
    turnInProgress: false,
    turnQueue: [],
    pendingInteraction: null,
    pendingInteractionResolver: null,
    ...overrides,
  };
}

describe('StreamEventDispatcher', () => {
  let registry: SessionRegistry;
  let dispatcher: StreamEventDispatcher;

  beforeEach(() => {
    registry = new SessionRegistry();
    dispatcher = new StreamEventDispatcher(registry);
  });

  describe('subscribeSession', () => {
    it('adds a subscriber to the session state and returns an unsubscribe fn', () => {
      const state = makeState();
      registry.set('sess-1', state);
      const cb = vi.fn();
      const unsubscribe = dispatcher.subscribeSession('sess-1', cb);
      expect(state.subscribers.size).toBe(1);
      unsubscribe();
      expect(state.subscribers.size).toBe(0);
    });

    it('returns a no-op unsubscribe when the session is unknown', () => {
      const cb = vi.fn();
      const unsubscribe = dispatcher.subscribeSession('missing', cb);
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('subscribeByFeature', () => {
    it('receives feature-level chunks and cleans up the map on final unsubscribe', () => {
      const cb = vi.fn();
      const unsubscribe = dispatcher.subscribeByFeature('feat-1', cb);
      dispatcher.notifyByFeatureId('feat-1', { delta: 'hi', done: false });
      expect(cb).toHaveBeenCalledWith({ delta: 'hi', done: false });
      unsubscribe();
      dispatcher.notifyByFeatureId('feat-1', { delta: 'after', done: false });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('supports multiple feature subscribers without collision', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      dispatcher.subscribeByFeature('feat-1', cb1);
      dispatcher.subscribeByFeature('feat-1', cb2);
      dispatcher.notifyByFeatureId('feat-1', { delta: 'x', done: false });
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeAll', () => {
    it('receives every chunk with its feature scope', () => {
      const cb = vi.fn();
      const unsubscribe = dispatcher.subscribeAll(cb);
      const state = makeState({ featureId: 'feat-9' });
      dispatcher.notify(state, { delta: 'hi', done: false });
      expect(cb).toHaveBeenCalledWith('feat-9', { delta: 'hi', done: false });
      unsubscribe();
      dispatcher.notify(state, { delta: 'nope', done: false });
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('notify', () => {
    it('fans out to session subs, feature subs, and global subs', () => {
      const sessionCb = vi.fn();
      const featureCb = vi.fn();
      const globalCb = vi.fn();

      const state = makeState({ sessionId: 'sess-1', featureId: 'feat-1' });
      state.subscribers.add(sessionCb);
      registry.set('sess-1', state);

      dispatcher.subscribeByFeature('feat-1', featureCb);
      dispatcher.subscribeAll(globalCb);

      const chunk: StreamChunk = { delta: 'hello', done: false };
      dispatcher.notify(state, chunk);

      expect(sessionCb).toHaveBeenCalledWith(chunk);
      expect(featureCb).toHaveBeenCalledWith(chunk);
      expect(globalCb).toHaveBeenCalledWith('feat-1', chunk);
    });

    it('does nothing extra when there are no subscribers', () => {
      const state = makeState();
      expect(() => dispatcher.notify(state, { delta: '', done: true })).not.toThrow();
    });
  });

  describe('notifyByFeatureId', () => {
    it('fans out to feature subs and global subs only', () => {
      const featureCb = vi.fn();
      const globalCb = vi.fn();
      dispatcher.subscribeByFeature('feat-1', featureCb);
      dispatcher.subscribeAll(globalCb);

      const chunk: StreamChunk = { delta: '', done: false, sessionStatus: 'ready' };
      dispatcher.notifyByFeatureId('feat-1', chunk);

      expect(featureCb).toHaveBeenCalledWith(chunk);
      expect(globalCb).toHaveBeenCalledWith('feat-1', chunk);
    });

    it('skips feature subs for other features', () => {
      const otherCb = vi.fn();
      dispatcher.subscribeByFeature('feat-other', otherCb);
      dispatcher.notifyByFeatureId('feat-1', { delta: '', done: false });
      expect(otherCb).not.toHaveBeenCalled();
    });
  });
});
