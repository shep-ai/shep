/**
 * Deployment Status Store
 *
 * External store (useSyncExternalStore-compatible) that holds the shared
 * deployment state keyed by targetId. Multiple components subscribed to
 * the same targetId see the same state — fixes the node/drawer-out-of-sync
 * bug and makes page-refresh hydration trivial.
 *
 * Mutation paths (deploy/stop/poll) go through server actions that wrap
 * use cases — this module stores state only and never contains business
 * logic.
 */

import type { DeploymentState } from '@shepai/core/domain/generated/output';
import type {
  DeploymentStatus,
  DeploymentStatusEntry,
} from '@shepai/core/application/ports/output/services/deployment-service.interface';

export interface DeploymentEntryState {
  status: DeploymentState | null;
  url: string | null;
  targetType: string | null;
  /** Whether mount-hydration (listDeployments / getDeploymentStatus) has completed for this targetId. */
  hydrated: boolean;
  deployLoading: boolean;
  stopLoading: boolean;
  deployError: string | null;
}

export const EMPTY_ENTRY: DeploymentEntryState = {
  status: null,
  url: null,
  targetType: null,
  hydrated: false,
  deployLoading: false,
  stopLoading: false,
  deployError: null,
};

type Listener = () => void;

export class DeploymentStatusStore {
  private entries = new Map<string, DeploymentEntryState>();
  private listeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();

  /** Seed the store from SSR data (ListDeploymentsUseCase output). */
  hydrate(entries: DeploymentStatusEntry[]): void {
    // Mark every SSR entry as hydrated and merge into the map.
    const seen = new Set<string>();
    for (const entry of entries) {
      seen.add(entry.targetId);
      this.update(entry.targetId, {
        status: entry.state,
        url: entry.url,
        targetType: entry.targetType,
        hydrated: true,
      });
    }
    // Any previously tracked entries missing from the SSR list are stale —
    // mark them hydrated with null state so subscribers learn their
    // deployment is gone.
    for (const [targetId, existing] of this.entries) {
      if (!seen.has(targetId) && existing.hydrated && existing.status !== null) {
        this.update(targetId, { status: null, url: null });
      } else if (!seen.has(targetId) && !existing.hydrated) {
        this.update(targetId, { hydrated: true });
      }
    }
  }

  getEntry(targetId: string): DeploymentEntryState {
    return this.entries.get(targetId) ?? EMPTY_ENTRY;
  }

  update(targetId: string, patch: Partial<DeploymentEntryState>): void {
    const current = this.entries.get(targetId) ?? EMPTY_ENTRY;
    const next: DeploymentEntryState = { ...current, ...patch };
    this.entries.set(targetId, next);
    this.notify(targetId);
  }

  /** Apply a status snapshot (from a server action result) to a targetId. */
  setStatus(targetId: string, status: DeploymentStatus | null): void {
    if (status === null) {
      this.update(targetId, { status: null, url: null, hydrated: true });
      return;
    }
    this.update(targetId, {
      status: status.state,
      url: status.url,
      hydrated: true,
    });
  }

  subscribe(targetId: string, listener: Listener): () => void {
    let set = this.listeners.get(targetId);
    if (!set) {
      set = new Set();
      this.listeners.set(targetId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set?.size === 0) this.listeners.delete(targetId);
    };
  }

  subscribeAll(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  private notify(targetId: string): void {
    const set = this.listeners.get(targetId);
    if (set) for (const l of set) l();
    for (const l of this.globalListeners) l();
  }
}
