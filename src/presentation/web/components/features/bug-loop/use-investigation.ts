'use client';

/**
 * The work item's latest investigation, refreshed every few seconds while an
 * agent is still on it (spec 123).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  InvestigationStatus,
  type WorkItemInvestigation,
} from '@shepai/core/domain/generated/output';
import { getLatestInvestigation } from '@/app/actions/bug-loop';

export const INVESTIGATION_POLL_MS = 3_000;

export function isInvestigationOpen(investigation: WorkItemInvestigation | undefined): boolean {
  return (
    investigation?.status === InvestigationStatus.Pending ||
    investigation?.status === InvestigationStatus.Running
  );
}

export function useInvestigation(workItemId: string, initial: WorkItemInvestigation | undefined) {
  const [investigation, setInvestigation] = useState(initial);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    const latest = await getLatestInvestigation(workItemId);
    if (latest.error) setError(latest.error);
    else setInvestigation(latest.investigation);
  }, [workItemId]);

  const open = isInvestigationOpen(investigation);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void refresh(), INVESTIGATION_POLL_MS);
    return () => clearInterval(timer);
  }, [open, refresh]);

  return { investigation, setInvestigation, error, setError, refresh };
}
