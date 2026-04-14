'use client';

/**
 * useGitStatus
 *
 * Polls GET /api/applications/:id/git/status every few seconds so the
 * SmartDeployButton's label can react to working-tree drift in
 * near-real-time. Cheap server-side (a handful of git subprocess calls)
 * so the polling cadence can stay aggressive without burning resources.
 *
 * State shape mirrors the GitWorkingTreeStatus port type one-for-one;
 * this hook intentionally avoids any business logic so the smart-state
 * hook upstream can do all the interpretation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GitStatusDto {
  branch: string | null;
  uncommittedCount: number;
  unpushedCount: number;
  hasRemote: boolean;
  remoteUrl: string | null;
}

export interface UseGitStatusResult {
  status: GitStatusDto | null;
  loading: boolean;
  error: string | null;
  /** Manual refresh — fired by sync mutations to immediately re-read state. */
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 5_000;

/**
 * The shape `null` for `status` means "we haven't loaded yet" — distinct
 * from "loaded and clean" (status with all-zero counts). Consumers should
 * render a skeleton state while `status === null && loading`.
 */
export function useGitStatus(applicationId: string): UseGitStatusResult {
  const [status, setStatus] = useState<GitStatusDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const refresh = useCallback(async () => {
    if (cancelledRef.current) return;
    try {
      const res = await fetch(`/api/applications/${applicationId}/git/status`);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // 404 is expected for a brand-new app — don't surface as an error.
        if (res.status !== 404) {
          setError(`Failed to read git status (HTTP ${res.status}: ${text.slice(0, 100)})`);
        }
        return;
      }
      const dto = (await res.json()) as GitStatusDto;
      if (cancelledRef.current) return;
      setStatus(dto);
      setError(null);
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to read git status');
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    cancelledRef.current = false;
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
  }, [refresh]);

  return { status, loading, error, refresh };
}
