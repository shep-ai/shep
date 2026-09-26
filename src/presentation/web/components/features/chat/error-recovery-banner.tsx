'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ApplicationErrorState {
  /** Short, human-readable kind: "Setup failed", "Interrupted", etc. */
  kind: string;
  /** Longer explanation shown below the headline. */
  message: string;
  /** True if the backend can re-run the failed pipeline. */
  retryable: boolean;
  /** The underlying error, e.g. "cursor-agent is not logged in", when known. */
  detail?: string;
  /**
   * Optional link to where the user can fix the problem themselves —
   * e.g. Settings when retrying cannot help until they change agent.
   */
  action?: { label: string; href: string };
}

// ── Error recovery banner ───────────────────────────────────────────────────
//
// Rendered at the very top of the chat pane when the application is
// in a broken state (setup failed, interrupted, etc.). Replaces
// silent failure where the only signal was a red "ERROR" pill in the
// top bar. Gives the user a clear headline, an explanation, and — if
// the backend says the operation is retryable — a prominent
// "Try again" button wired to `onResumeWorkflow`. When the fix is up
// to the user (e.g. switching agent), `state.action` links them there.
export function ErrorRecoveryBanner({
  state,
  onRetry,
}: {
  state: ApplicationErrorState;
  onRetry?: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const handleRetry = useCallback(() => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      onRetry();
    } finally {
      // `onRetry` is fire-and-forget (POSTs the resume endpoint).
      // Clear the local spinner after a short window so the button
      // doesn't stay locked if the parent forgot to refresh state.
      setTimeout(() => setRetrying(false), 4000);
    }
  }, [onRetry, retrying]);

  return (
    <div
      className={cn(
        // `shrink-0` — direct child of the Thread viewport flex
        // column, so it must not be squashed when siblings expand.
        'animate-in fade-in-0 slide-in-from-top-1 mx-3 my-3 shrink-0 overflow-hidden rounded-lg border shadow-sm duration-200 ease-out',
        'border-red-500/40 bg-red-500/5 dark:bg-red-500/10'
      )}
      role="alert"
    >
      <div className="flex items-start gap-3 px-3 py-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/15">
          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-red-700 dark:text-red-300">
            {state.kind}
          </div>
          <div className="text-foreground/80 mt-0.5 text-[12px] leading-relaxed">
            {state.message}
          </div>
          {state.detail ? (
            <div className="mt-1.5 rounded bg-red-500/10 px-2 py-1 font-mono text-[11px] break-words text-red-700 dark:text-red-300">
              {state.detail}
            </div>
          ) : null}
          {state.retryable && onRetry ? (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md bg-red-500 px-3 text-[11px] font-semibold text-white transition-opacity',
                  retrying ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:opacity-90'
                )}
              >
                <RefreshCw className={cn('h-3 w-3', retrying && 'animate-spin')} />
                {retrying ? 'Retrying…' : 'Try again'}
              </button>
              <span className="text-muted-foreground text-[10px]">
                Re-runs the last failed step
              </span>
            </div>
          ) : null}
          {state.action ? (
            <div className="mt-2.5">
              <Link
                href={state.action.href}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-red-500/40 px-3 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-500/10 dark:text-red-300"
              >
                <Settings className="h-3 w-3" />
                {state.action.label}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
