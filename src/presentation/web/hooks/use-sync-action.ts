'use client';

/**
 * useSyncAction
 *
 * Wraps POST /api/applications/:id/git/sync as a hook with local state
 * (idle / running / failed / done). Surfaces server errors verbatim
 * because the operation log drawer covers the full diagnostic — this
 * hook only needs enough state to render the SmartDeployButton's label.
 */

import { useCallback, useState } from 'react';

export type SyncActionState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'failed'; error: string; code: string | null }
  | { kind: 'done'; committed: boolean; pushed: boolean; headSha: string };

export interface UseSyncActionResult {
  state: SyncActionState;
  /** Trigger the sync. Resolves after the server responds or rejects. */
  sync(message?: string): Promise<void>;
  /** Reset back to idle — used when the user dismisses an error. */
  reset(): void;
}

interface SyncResponseDto {
  headSha: string;
  committed: boolean;
  pushed: boolean;
}

interface SyncErrorDto {
  error?: string;
  code?: string;
}

export function useSyncAction(applicationId: string): UseSyncActionResult {
  const [state, setState] = useState<SyncActionState>({ kind: 'idle' });

  const sync = useCallback(
    async (message?: string) => {
      setState({ kind: 'running' });
      try {
        const res = await fetch(`/api/applications/${applicationId}/git/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message ? { message } : {}),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as SyncErrorDto;
          setState({
            kind: 'failed',
            error: body.error ?? `Save failed (HTTP ${res.status})`,
            code: body.code ?? null,
          });
          return;
        }
        const dto = (await res.json()) as SyncResponseDto;
        setState({
          kind: 'done',
          committed: dto.committed,
          pushed: dto.pushed,
          headSha: dto.headSha,
        });
      } catch (err) {
        setState({
          kind: 'failed',
          error: err instanceof Error ? err.message : 'Network error contacting server',
          code: null,
        });
      }
    },
    [applicationId]
  );

  const reset = useCallback(() => {
    setState({ kind: 'idle' });
  }, []);

  return { state, sync, reset };
}
