'use client';

/**
 * DeploymentStatusProvider
 *
 * Wraps the dashboard with a shared deployment-status store seeded from
 * SSR data (ListDeploymentsUseCase via get-graph-data). All components
 * that call `useDeployAction(targetId)` subscribe to the same store, so
 * the "click Run on node → tab shows URL instantly" bug and the
 * "URL lost after refresh" bug are both resolved by construction.
 *
 * All business logic lives in use cases on the backend. This provider
 * owns only UI state transitions: which entries are hydrated, which are
 * loading, which have errors, and which need polling.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { DeploymentStatusEntry } from '@shepai/core/application/ports/output/services/deployment-service.interface';
import type { DeploymentState } from '@shepai/core/domain/generated/output';
import { deployFeature } from '@/app/actions/deploy-feature';
import { deployRepository } from '@/app/actions/deploy-repository';
import { deployApplication } from '@/app/actions/deploy-application';
import { stopDeployment } from '@/app/actions/stop-deployment';
import { getDeploymentStatus } from '@/app/actions/get-deployment-status';
import { createLogger } from '@/lib/logger';
import {
  DeploymentStatusStore,
  type DeploymentEntryState,
  EMPTY_ENTRY,
} from './deployment-status-store';

const log = createLogger('[DeploymentStatusProvider]');

const POLL_INTERVAL_MS = 3000;
const ACTIVE_STATES: ReadonlySet<DeploymentState> = new Set([
  'Booting',
  'Ready',
] as DeploymentState[]);

export interface DeployActionInput {
  targetId: string;
  targetType: 'feature' | 'repository' | 'application';
  repositoryPath: string;
  branch?: string;
}

interface DeploymentContextValue {
  store: DeploymentStatusStore;
  deploy: (input: DeployActionInput) => Promise<void>;
  stop: (targetId: string) => Promise<void>;
  ensureHydrated: (targetId: string) => void;
}

const DeploymentStatusContext = createContext<DeploymentContextValue | null>(null);

export function DeploymentStatusProvider({
  initialDeployments,
  children,
}: {
  initialDeployments: DeploymentStatusEntry[];
  children: ReactNode;
}) {
  // One store per provider instance. Stable across renders.
  const storeRef = useRef<DeploymentStatusStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new DeploymentStatusStore();
    storeRef.current.hydrate(initialDeployments);
  }
  const store = storeRef.current;

  // Re-hydrate when SSR data changes (e.g. after graph-data poll).
  useEffect(() => {
    store.hydrate(initialDeployments);
  }, [initialDeployments, store]);

  // ── Polling ──────────────────────────────────────────────────────────
  // One interval per targetId. Started when an entry becomes active
  // (Booting/Ready) and stopped when it is no longer active.
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const stopPolling = useCallback((targetId: string) => {
    const existing = pollIntervalsRef.current.get(targetId);
    if (existing) {
      clearInterval(existing);
      pollIntervalsRef.current.delete(targetId);
    }
  }, []);

  const startPolling = useCallback(
    (targetId: string) => {
      if (pollIntervalsRef.current.has(targetId)) return;
      const interval = setInterval(async () => {
        let result;
        try {
          result = await getDeploymentStatus(targetId);
        } catch (err) {
          log.warn(`poll failed for "${targetId}"`, err);
          store.setStatus(targetId, null);
          stopPolling(targetId);
          return;
        }
        if (!result || result.state === 'Stopped') {
          store.setStatus(targetId, null);
          stopPolling(targetId);
          return;
        }
        store.setStatus(targetId, result);
      }, POLL_INTERVAL_MS);
      pollIntervalsRef.current.set(targetId, interval);
    },
    [store, stopPolling]
  );

  // Reconcile polling with store state on every change.
  useEffect(() => {
    const intervals = pollIntervalsRef.current;
    const reconcile = () => {
      // Stop polls for entries that are no longer active.
      for (const [targetId] of intervals) {
        const entry = store.getEntry(targetId);
        if (!entry.status || !ACTIVE_STATES.has(entry.status)) {
          stopPolling(targetId);
        }
      }
    };
    const unsubscribe = store.subscribeAll(reconcile);
    return () => {
      unsubscribe();
      for (const [, interval] of intervals) clearInterval(interval);
      intervals.clear();
    };
  }, [store, stopPolling]);

  // ── Mount hydration per targetId ─────────────────────────────────────
  // When a hook subscribes to a targetId that was not in the SSR hydration
  // (e.g. a stale page with deployments started in another tab), fetch its
  // status once from the backend via getDeploymentStatus → use case.
  const ensureHydrated = useCallback(
    (targetId: string) => {
      if (!targetId) return;
      const entry = store.getEntry(targetId);
      if (entry.hydrated) return;
      // Mark hydrated immediately to dedupe concurrent callers.
      store.update(targetId, { hydrated: true });
      void (async () => {
        try {
          const result = await getDeploymentStatus(targetId);
          store.setStatus(targetId, result);
          if (result && ACTIVE_STATES.has(result.state)) startPolling(targetId);
        } catch (err) {
          log.warn(`ensureHydrated failed for "${targetId}"`, err);
        }
      })();
    },
    [store, startPolling]
  );

  // ── Actions ──────────────────────────────────────────────────────────
  const deploy = useCallback(
    async (input: DeployActionInput) => {
      store.update(input.targetId, { deployLoading: true, deployError: null });
      try {
        const result =
          input.targetType === 'feature'
            ? await deployFeature(input.targetId)
            : input.targetType === 'application'
              ? await deployApplication(input.targetId)
              : await deployRepository(input.repositoryPath);
        if (!result.success) {
          store.update(input.targetId, {
            deployLoading: false,
            deployError: result.error ?? 'An unexpected error occurred',
          });
          return;
        }
        store.update(input.targetId, {
          deployLoading: false,
          status: result.state ?? null,
          url: null,
          hydrated: true,
          targetType: input.targetType,
        });
        startPolling(input.targetId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        store.update(input.targetId, { deployLoading: false, deployError: message });
      }
    },
    [store, startPolling]
  );

  const stop = useCallback(
    async (targetId: string) => {
      if (!targetId) return;
      store.update(targetId, { stopLoading: true });
      try {
        const result = await stopDeployment(targetId);
        if (result.success) {
          stopPolling(targetId);
          store.update(targetId, {
            stopLoading: false,
            status: null,
            url: null,
          });
        } else {
          store.update(targetId, { stopLoading: false });
        }
      } catch (err) {
        log.warn('stop error (non-critical)', err);
        store.update(targetId, { stopLoading: false });
      }
    },
    [store, stopPolling]
  );

  const value = useMemo<DeploymentContextValue>(
    () => ({ store, deploy, stop, ensureHydrated }),
    [store, deploy, stop, ensureHydrated]
  );

  return (
    <DeploymentStatusContext.Provider value={value}>{children}</DeploymentStatusContext.Provider>
  );
}

export function useDeploymentStatusContext(): DeploymentContextValue {
  const ctx = useContext(DeploymentStatusContext);
  if (!ctx) {
    throw new Error('useDeploymentStatusContext must be used within a <DeploymentStatusProvider>');
  }
  return ctx;
}

/**
 * Non-throwing variant used by presentational hooks (e.g. useDeployAction)
 * that may render inside Storybook or other isolated contexts without
 * a provider. Returns a stub store/actions that do nothing.
 */
export function useDeploymentStatusContextOptional(): DeploymentContextValue {
  const ctx = useContext(DeploymentStatusContext);
  if (ctx) return ctx;
  return FALLBACK_CONTEXT;
}

const FALLBACK_STORE = new DeploymentStatusStore();
const FALLBACK_CONTEXT: DeploymentContextValue = {
  store: FALLBACK_STORE,
  deploy: async () => {
    /* no-op */
  },
  stop: async () => {
    /* no-op */
  },
  ensureHydrated: () => {
    /* no-op */
  },
};

export { EMPTY_ENTRY, type DeploymentEntryState };
