'use client';

/**
 * useRunAction — runs one server action for a page backed by use cases: shows
 * its error, or refreshes the route so the server component re-reads its data.
 * Resolves true on success. Used by the Spaces, Connections and Opportunities
 * pages.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

/** What every such server action resolves to. */
export interface ActionResult {
  ok: boolean;
  error?: string;
}

export type RunAction = (action: () => Promise<ActionResult>) => Promise<boolean>;

export interface UseRunActionOptions {
  /** Message shown when an action throws or fails without saying why. */
  fallbackError: string;
  /** Refresh after a failure too (a failed sync may still have changed data). */
  refreshOnFailure?: boolean;
  initialError?: string;
}

export function useRunAction({
  fallbackError,
  refreshOnFailure = false,
  initialError,
}: UseRunActionOptions): { run: RunAction; error: string | null } {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError ?? null);

  const run = useCallback<RunAction>(
    async (action) => {
      setError(null);
      const result: ActionResult = await action().catch((cause: unknown) => ({
        ok: false,
        error: cause instanceof Error ? cause.message : fallbackError,
      }));
      if (result.ok || refreshOnFailure) router.refresh();
      if (!result.ok) {
        setError(result.error ?? fallbackError);
        return false;
      }
      return true;
    },
    [router, fallbackError, refreshOnFailure]
  );

  return { run, error };
}
