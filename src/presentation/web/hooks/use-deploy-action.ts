'use client';

/**
 * useDeployAction
 *
 * Thin subscriber to the shared DeploymentStatusProvider, scoped to one
 * targetId. All components that call this hook with the same targetId
 * see the same state — a click on a node updates the drawer instantly,
 * and state survives page refresh via SSR hydration.
 *
 * Business logic (start/stop/status) lives in backend use cases — this
 * hook contains zero decision-making code.
 */

import { useEffect, useSyncExternalStore, useCallback } from 'react';
import type { DeploymentState } from '@shepai/core/domain/generated/output';
import {
  useDeploymentStatusContextOptional,
  type DeployActionInput,
} from './deployment-status-provider';

export type { DeployActionInput };

/** Stable no-op unsubscribe for hooks called with a null input. */
function noop(): void {
  /* no-op */
}

export interface DeployActionState {
  deploy: () => Promise<void>;
  stop: () => Promise<void>;
  deployLoading: boolean;
  stopLoading: boolean;
  deployError: string | null;
  status: DeploymentState | null;
  url: string | null;
}

export function useDeployAction(input: DeployActionInput | null): DeployActionState {
  const { store, deploy, stop, ensureHydrated } = useDeploymentStatusContextOptional();
  const targetId = input?.targetId ?? '';

  // Subscribe to the store entry for this targetId.
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!targetId) return noop;
      return store.subscribe(targetId, listener);
    },
    [store, targetId]
  );
  const getSnapshot = useCallback(
    () => (targetId ? store.getEntry(targetId) : store.getEntry('')),
    [store, targetId]
  );
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // On mount (or when targetId changes), ensure the entry is hydrated.
  useEffect(() => {
    if (targetId) ensureHydrated(targetId);
  }, [targetId, ensureHydrated]);

  const handleDeploy = useCallback(async () => {
    if (!input) return;
    await deploy(input);
  }, [deploy, input]);

  const handleStop = useCallback(async () => {
    if (!targetId) return;
    await stop(targetId);
  }, [stop, targetId]);

  return {
    deploy: handleDeploy,
    stop: handleStop,
    deployLoading: entry.deployLoading,
    stopLoading: entry.stopLoading,
    deployError: entry.deployError,
    status: entry.status,
    url: entry.url,
  };
}
