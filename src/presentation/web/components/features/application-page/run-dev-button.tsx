'use client';

/**
 * Application-page "Preview" button.
 *
 * Compact, VSCode-style control in the application top bar that
 * drives the application's local dev server via the shared
 * `DeploymentService`. Styled in Shep's AI-purple palette (indigo →
 * violet) to match the application node gradient — this is a
 * first-class Shep action, not a generic dev-tool button.
 *
 *   - Idle    → purple Play icon + "Preview"
 *   - Booting → amber spinner + "Starting…" (click stops)
 *   - Ready   → purple URL pill + separate stop button (never
 *               hover-swaps so the URL is always clickable)
 *   - Error   → red triangle + "Retry"
 *
 * Persistence: deployment state is stored in the `dev_servers` SQLite
 * table by the core `DeploymentService` (migration 040). The shared
 * `DeploymentStatusProvider` is SSR-seeded with the current deployment
 * status (via the route's `ListDeploymentsUseCase` snapshot), and the
 * provider's `ensureHydrated` effect fills in anything the seed missed
 * — so a page reload or even a Shep server restart still surfaces the
 * running dev server (the service's `recoverAll()` reconciles live PIDs
 * on startup).
 *
 * This component is purely presentational: it takes the already-
 * computed `deploy` state from `useDeployAction` so the top bar and
 * the right-pane Web iframe can share ONE polling loop instead of
 * duplicating it via two separate hook instances.
 */

import { useCallback } from 'react';
import { Play, Square, Loader2, TriangleAlert, ExternalLink } from 'lucide-react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import type { DeployActionState } from '@/hooks/use-deploy-action';

export interface RunDevButtonProps {
  deploy: DeployActionState;
  className?: string;
  /** When true the button is grayed out and non-interactive (e.g. agent is running). */
  disabled?: boolean;
  /**
   * Visual density of the Ready state.
   *
   * - `'full'` (default) — URL pill + adjacent Stop button. Used in
   *   the application page top bar where there's horizontal room
   *   and the URL is the most useful piece of information.
   * - `'compact'` — just a subtle Stop button, no URL pill. Used on
   *   the canvas application card where the running URL is already
   *   visible as an open-in-new-tab icon on the iframe preview, so
   *   repeating it in the button would be pure redundancy.
   */
  variant?: 'full' | 'compact';
}

/**
 * Shared "agent is working" tooltip text used across every branch
 * when `disabled` is true. Keeps the message consistent no matter
 * which deployment state the button is rendering.
 */
const DISABLED_TITLE = 'Preview disabled while agent is running';

/**
 * Shared grayout classes applied on top of every branch's base
 * variant classes. `pointer-events-none` wins over `hover:` rules so
 * the button cannot be clicked OR react visually to hover.
 */
const DISABLED_CLASSES =
  'cursor-not-allowed opacity-50 pointer-events-none grayscale [&_*]:pointer-events-none';

export function RunDevButton({ deploy, className, disabled, variant = 'full' }: RunDevButtonProps) {
  const openUrl = useCallback(() => {
    if (disabled) return;
    if (deploy.url) window.open(deploy.url, '_blank', 'noopener,noreferrer');
  }, [disabled, deploy.url]);

  // ────────────────────────────────────────────────────────────
  // Booting — spinner + "Starting…", click to stop
  // ────────────────────────────────────────────────────────────
  if (deploy.status === DeploymentState.Booting || deploy.deployLoading) {
    return (
      <button
        type="button"
        onClick={disabled ? undefined : deploy.stop}
        disabled={disabled === true ? true : deploy.stopLoading}
        aria-disabled={disabled === true ? true : undefined}
        className={cn(
          'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400',
          disabled && DISABLED_CLASSES,
          className
        )}
        title={disabled ? DISABLED_TITLE : 'Dev server is starting — click to stop'}
        aria-label="Stop starting dev server"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Starting…</span>
      </button>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Ready (compact) — just a subtle Stop button.
  //
  // Used on the canvas application card, where the running URL is
  // already shown as an open-in-new-tab icon on the iframe preview,
  // so repeating it in the button would be pure redundancy.
  // ────────────────────────────────────────────────────────────
  if (deploy.status === DeploymentState.Ready && deploy.url && variant === 'compact') {
    return (
      <button
        type="button"
        onClick={disabled ? undefined : deploy.stop}
        disabled={disabled === true ? true : deploy.stopLoading}
        aria-disabled={disabled === true ? true : undefined}
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/5 text-red-600 transition-colors hover:border-red-500/60 hover:bg-red-500/15 dark:text-red-400',
          disabled && DISABLED_CLASSES,
          className
        )}
        title={disabled ? DISABLED_TITLE : 'Stop dev server'}
        aria-label="Stop dev server"
      >
        {deploy.stopLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Square className="h-3 w-3 fill-current" />
        )}
      </button>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Ready (full) — URL pill + separate adjacent Stop button.
  //
  // The URL is ALWAYS the left click target (no hover-swap). A small
  // stop button sits immediately to its right, visually grouped into
  // a single rounded pill via shared border colors and a thin inner
  // divider. This way the user can click the URL without the button
  // morphing out from under the cursor.
  // ────────────────────────────────────────────────────────────
  if (deploy.status === DeploymentState.Ready && deploy.url) {
    const shortUrl = deploy.url.replace(/^https?:\/\//, '');
    return (
      <div
        className={cn(
          'inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded-md border border-violet-500/40 bg-violet-500/10 text-[11px] font-medium text-violet-700 dark:text-violet-300',
          disabled && DISABLED_CLASSES,
          className
        )}
        title={disabled ? DISABLED_TITLE : undefined}
        aria-disabled={disabled === true ? true : undefined}
      >
        {/* URL — always the click target, opens in a new tab */}
        <button
          type="button"
          onClick={openUrl}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-2 font-mono transition-colors hover:bg-violet-500/20"
          title={disabled ? DISABLED_TITLE : `Open ${deploy.url}`}
          aria-label={`Open dev server at ${deploy.url}`}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
          </span>
          <span className="truncate">{shortUrl}</span>
          <ExternalLink className="h-3 w-3 opacity-60" />
        </button>

        {/* Divider */}
        <span className="w-px bg-violet-500/30" aria-hidden />

        {/* Stop — always visible, never swaps with the URL */}
        <button
          type="button"
          onClick={disabled ? undefined : deploy.stop}
          disabled={disabled === true ? true : deploy.stopLoading}
          className="inline-flex items-center justify-center px-1.5 text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-400"
          title={disabled ? DISABLED_TITLE : 'Stop dev server'}
          aria-label="Stop dev server"
        >
          {deploy.stopLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Square className="h-3 w-3 fill-current" />
          )}
        </button>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Error — red triangle, click to retry
  // ────────────────────────────────────────────────────────────
  if (deploy.deployError) {
    return (
      <button
        type="button"
        onClick={disabled ? undefined : deploy.deploy}
        disabled={disabled}
        aria-disabled={disabled === true ? true : undefined}
        className={cn(
          'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-400',
          disabled && DISABLED_CLASSES,
          className
        )}
        title={disabled ? DISABLED_TITLE : deploy.deployError}
        aria-label="Retry starting dev server"
      >
        <TriangleAlert className="h-3 w-3" />
        <span>Retry</span>
      </button>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Idle — default "Preview" button (Shep AI purple)
  // ────────────────────────────────────────────────────────────
  return (
    <button
      type="button"
      onClick={disabled ? undefined : deploy.deploy}
      disabled={disabled}
      aria-disabled={disabled === true ? true : undefined}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors',
        disabled
          ? 'border-border bg-muted text-muted-foreground/40 pointer-events-none cursor-not-allowed'
          : 'border-violet-500/50 bg-gradient-to-br from-indigo-500/15 to-violet-500/20 text-violet-700 hover:from-indigo-500/25 hover:to-violet-500/30 dark:text-violet-300',
        className
      )}
      title={disabled ? DISABLED_TITLE : 'Install dependencies and preview the app'}
      aria-label="Preview app"
    >
      <Play className="h-3 w-3 fill-current" />
      <span>Preview</span>
    </button>
  );
}
