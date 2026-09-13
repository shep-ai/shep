'use client';

/**
 * FleetControl (spec 111)
 *
 * Data wiring for the fleet surfaces: renders the pinned status bar and the
 * triage drawer it opens, and owns the refresh cycle.
 *
 * The server layout passes `initialData` so the dashboard paints the fleet state
 * on first render; without it the control loads on mount and shows its loading
 * state instead.
 */

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { FleetStatusBar, type FleetStatusBarState } from './fleet-status-bar';
import { FleetTriageDrawer } from './fleet-triage-drawer';
import { getFleetData, type FleetData } from '@/app/actions/fleet-data';

export interface FleetControlProps {
  /** Fleet snapshot resolved on the server, if the host page provided one. */
  initialData?: FleetData;
  /** Optional repository scope passed through to the server action. */
  repositoryPath?: string;
  className?: string;
}

export function FleetControl({ initialData, repositoryPath, className }: FleetControlProps) {
  const [data, setData] = useState<FleetData | undefined>(initialData);
  const [state, setState] = useState<FleetStatusBarState>(initialData ? 'ready' : 'loading');
  const [error, setError] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await getFleetData(repositoryPath);
      setData(next);
      setState('ready');
      setError(undefined);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [repositoryPath]);

  useEffect(() => {
    if (!initialData) {
      void load();
    }
  }, [initialData, load]);

  // A fleet with nothing in it is not worth a permanent chip on the dashboard.
  if (state === 'ready' && (data?.overview.counts.total ?? 0) === 0) {
    return null;
  }

  return (
    <div className={cn('flex justify-end', className)} data-testid="fleet-control">
      <FleetStatusBar
        counts={data?.overview.counts}
        circuitBreakerTripped={data?.overview.circuitBreakerTripped}
        circuitBreakerReason={data?.overview.circuitBreakerReason}
        state={state}
        errorMessage={error}
        onOpenTriage={() => setOpen(true)}
        onRetry={() => void load()}
      />
      <FleetTriageDrawer
        items={data?.triageItems ?? []}
        open={open}
        onOpenChange={setOpen}
        onRefresh={() => void load()}
        refreshing={refreshing}
      />
    </div>
  );
}
