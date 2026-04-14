/**
 * SessionRegistry Unit Tests
 *
 * Pure in-memory state container — no mocks needed beyond the value type.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  SessionRegistry,
  type SessionState,
} from '@/infrastructure/services/interactive/core/session-registry.js';

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

describe('SessionRegistry', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  describe('session state CRUD', () => {
    it('set/get/has/delete round-trips a session state', () => {
      const state = makeState();
      expect(registry.has('sess-1')).toBe(false);
      registry.set('sess-1', state);
      expect(registry.has('sess-1')).toBe(true);
      expect(registry.get('sess-1')).toBe(state);
      registry.delete('sess-1');
      expect(registry.has('sess-1')).toBe(false);
      expect(registry.get('sess-1')).toBeUndefined();
    });

    it('values() iterates every stored state', () => {
      registry.set('a', makeState({ sessionId: 'a', featureId: 'fa' }));
      registry.set('b', makeState({ sessionId: 'b', featureId: 'fb' }));
      const all = Array.from(registry.values()).map((s) => s.sessionId);
      expect(all.sort()).toEqual(['a', 'b']);
    });
  });

  describe('findActiveStateForFeature', () => {
    it('returns the first state whose featureId matches', () => {
      const s1 = makeState({ sessionId: 's1', featureId: 'fx' });
      const s2 = makeState({ sessionId: 's2', featureId: 'fy' });
      registry.set('s1', s1);
      registry.set('s2', s2);
      expect(registry.findActiveStateForFeature('fy')).toBe(s2);
    });

    it('returns undefined when no state matches', () => {
      registry.set('s1', makeState({ featureId: 'fx' }));
      expect(registry.findActiveStateForFeature('missing')).toBeUndefined();
    });
  });

  describe('stopped agent session id cache', () => {
    it('caches and retrieves an agentSessionId by feature', () => {
      registry.cacheStoppedAgentSessionId('feat-1', 'agent-abc');
      expect(registry.takeStoppedAgentSessionId('feat-1')).toBe('agent-abc');
    });

    it('takeStoppedAgentSessionId does NOT delete the cached entry', () => {
      registry.cacheStoppedAgentSessionId('feat-1', 'agent-abc');
      registry.takeStoppedAgentSessionId('feat-1');
      expect(registry.takeStoppedAgentSessionId('feat-1')).toBe('agent-abc');
    });

    it('deleteStoppedAgentSessionId clears the cached entry', () => {
      registry.cacheStoppedAgentSessionId('feat-1', 'agent-abc');
      registry.deleteStoppedAgentSessionId('feat-1');
      expect(registry.takeStoppedAgentSessionId('feat-1')).toBeUndefined();
    });
  });

  describe('active step tracking', () => {
    it('sets, reads, and clears the active step for a feature', () => {
      expect(registry.getActiveStep('feat-1')).toBeUndefined();
      registry.setActiveStep('feat-1', 'step-42');
      expect(registry.getActiveStep('feat-1')).toBe('step-42');
      registry.clearActiveStep('feat-1');
      expect(registry.getActiveStep('feat-1')).toBeUndefined();
    });

    it('tracks active steps independently per feature', () => {
      registry.setActiveStep('feat-a', 'step-1');
      registry.setActiveStep('feat-b', 'step-2');
      expect(registry.getActiveStep('feat-a')).toBe('step-1');
      expect(registry.getActiveStep('feat-b')).toBe('step-2');
      registry.clearActiveStep('feat-a');
      expect(registry.getActiveStep('feat-a')).toBeUndefined();
      expect(registry.getActiveStep('feat-b')).toBe('step-2');
    });
  });
});
