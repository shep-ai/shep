'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cluster } from '@shepai/core/domain/generated/output';

const POLL_INTERVAL_MS = 3_000;

export interface UseClusterEventsResult {
  /** All clusters, refreshed periodically */
  clusters: Cluster[];
  /** Whether the initial load is in progress */
  loading: boolean;
  /** Trigger an immediate refresh */
  refresh: () => void;
}

/**
 * Polls /api/clusters for live cluster state updates.
 *
 * Cluster status changes (Provisioning → Ready, etc.) are written to the DB
 * by the cluster agent worker. This hook polls the API to pick up those
 * changes and provide real-time status in the UI.
 */
export function useClusterEvents(): UseClusterEventsResult {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchClusters = useCallback(async () => {
    try {
      const res = await fetch('/api/clusters');
      if (!res.ok) return;
      const data = (await res.json()) as Cluster[];
      if (mountedRef.current) {
        setClusters(data);
        setLoading(false);
      }
    } catch {
      // Silently ignore — next poll will retry
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchClusters();

    const interval = setInterval(() => {
      void fetchClusters();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchClusters]);

  return { clusters, loading, refresh: fetchClusters };
}
