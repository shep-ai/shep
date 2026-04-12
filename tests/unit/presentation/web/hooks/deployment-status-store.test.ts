// @vitest-environment node

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeploymentStatusStore } from '../../../../../src/presentation/web/hooks/deployment-status-store.js';
import { DeploymentState } from '@shepai/core/domain/generated/output';

describe('DeploymentStatusStore', () => {
  let store: DeploymentStatusStore;

  beforeEach(() => {
    store = new DeploymentStatusStore();
  });

  describe('hydrate', () => {
    it('seeds entries from SSR data and marks them hydrated', () => {
      store.hydrate([
        {
          targetId: 'feat-1',
          targetType: 'feature',
          state: DeploymentState.Ready,
          url: 'http://localhost:3000',
        },
      ]);

      const entry = store.getEntry('feat-1');
      expect(entry.status).toBe(DeploymentState.Ready);
      expect(entry.url).toBe('http://localhost:3000');
      expect(entry.targetType).toBe('feature');
      expect(entry.hydrated).toBe(true);
    });

    it('clears entries that are no longer present in the SSR data', () => {
      store.hydrate([
        {
          targetId: 'feat-1',
          targetType: 'feature',
          state: DeploymentState.Ready,
          url: null,
        },
      ]);
      expect(store.getEntry('feat-1').status).toBe(DeploymentState.Ready);

      store.hydrate([]);

      expect(store.getEntry('feat-1').status).toBeNull();
      expect(store.getEntry('feat-1').hydrated).toBe(true);
    });

    it('marks an empty store as hydrated when rehydrating with empty data', () => {
      store.hydrate([]);
      // A previously unseen targetId is still EMPTY_ENTRY
      expect(store.getEntry('nope').hydrated).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('notifies subscribers for the matching targetId on update', () => {
      const listener = vi.fn();
      store.subscribe('feat-1', listener);

      store.update('feat-1', { status: DeploymentState.Booting });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not notify subscribers for other targetIds', () => {
      const listener = vi.fn();
      store.subscribe('feat-1', listener);

      store.update('feat-2', { status: DeploymentState.Booting });

      expect(listener).not.toHaveBeenCalled();
    });

    it('notifies global subscribers for every update', () => {
      const listener = vi.fn();
      store.subscribeAll(listener);

      store.update('feat-1', { deployLoading: true });
      store.update('feat-2', { deployLoading: true });

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('cleanup function unsubscribes the listener', () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe('feat-1', listener);
      unsubscribe();

      store.update('feat-1', { deployLoading: true });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('setStatus', () => {
    it('applies a status snapshot and marks hydrated', () => {
      store.setStatus('feat-1', { state: DeploymentState.Ready, url: 'http://a' });
      const entry = store.getEntry('feat-1');
      expect(entry.status).toBe(DeploymentState.Ready);
      expect(entry.url).toBe('http://a');
      expect(entry.hydrated).toBe(true);
    });

    it('clears status when passed null', () => {
      store.update('feat-1', { status: DeploymentState.Ready, url: 'http://a' });
      store.setStatus('feat-1', null);
      const entry = store.getEntry('feat-1');
      expect(entry.status).toBeNull();
      expect(entry.url).toBeNull();
    });
  });
});
