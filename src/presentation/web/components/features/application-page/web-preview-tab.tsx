'use client';

/**
 * Web preview tab — embeds the running dev server as an iframe inside
 * the application page's right pane. Wired to the same deploy state
 * as the top-bar Run button so there's a single source of truth.
 *
 * States:
 *   - Ready   → <iframe src={url}> with an "open in new tab" badge
 *   - Booting → spinner + "Starting dev server…"
 *   - Idle    → friendly empty state pointing at the Run button
 *   - Error   → deploy error with a retry hint
 *
 * The iframe is always mounted once we have a URL so switching tabs
 * (IDE → Terminal → Web) does NOT tear down the preview session. It
 * is loaded without a `sandbox` attribute because Vite HMR needs
 * websockets and script execution; this is safe because the target
 * is always localhost on the user's machine.
 */

import { useCallback } from 'react';
import { ExternalLink, Loader2, Play, TriangleAlert, Globe } from 'lucide-react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import type { DeployActionState } from '@/hooks/use-deploy-action';

export interface WebPreviewTabProps {
  deploy: DeployActionState;
}

export function WebPreviewTab({ deploy }: WebPreviewTabProps) {
  const openInNewTab = useCallback(() => {
    if (deploy.url) window.open(deploy.url, '_blank', 'noopener,noreferrer');
  }, [deploy.url]);

  // Ready — live iframe
  if (deploy.status === DeploymentState.Ready && deploy.url) {
    return (
      // Outer container is themed (not hard-coded bg-white) so the
      // URL bar gets a proper dark-mode surface underneath; only the
      // iframe itself is forced white so the rendered app has a
      // neutral canvas.
      <div className="bg-background flex min-h-0 flex-1 flex-col">
        {/* Thin URL bar — shows the live URL and lets the user pop
            the preview out into a real browser tab. */}
        <div className="border-border bg-muted/70 text-foreground flex h-8 shrink-0 items-center gap-2 border-b px-2 text-[11px] dark:bg-neutral-900">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-foreground/90 truncate font-mono">{deploy.url}</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={openInNewTab}
            className="text-muted-foreground hover:text-foreground hover:bg-background/60 inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors dark:hover:bg-neutral-800"
            title="Open in a new browser tab"
          >
            <ExternalLink className="h-3 w-3" />
            <span>Open</span>
          </button>
        </div>
        <iframe
          // `key` pinned to the URL so re-deploying at a different
          // port doesn't reuse a stale document.
          key={deploy.url}
          src={deploy.url}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          title="Application preview"
        />
      </div>
    );
  }

  // Booting — spinner
  if (deploy.status === DeploymentState.Booting || deploy.deployLoading) {
    return (
      <EmptyState
        icon={<Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />}
        title="Starting dev server…"
        description="Installing dependencies and booting the app. This can take a minute on the first run."
      />
    );
  }

  // Error
  if (deploy.deployError) {
    return (
      <EmptyState
        icon={<TriangleAlert className="h-8 w-8 text-red-500" />}
        title="Failed to start dev server"
        description={deploy.deployError}
        actionLabel="Retry"
        onAction={deploy.deploy}
      />
    );
  }

  // Idle — CTA directly kicks off the dev server. Previously this
  // fell through to `onRunClicked` (which only switched the view to
  // Web) so clicking it while already on the Web tab did nothing.
  return (
    <EmptyState
      icon={<Globe className="text-muted-foreground h-8 w-8" />}
      title="No dev server running"
      description="Click Preview to install dependencies and start the app. The preview will appear here."
      actionLabel="Preview"
      actionIcon={<Play className="h-3.5 w-3.5 fill-current" />}
      onAction={deploy.deploy}
    />
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Small centered empty-state helper                              */
/* ────────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
}

function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {icon}
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            // AI-purple palette — identical to the top-bar Preview
            // button (run-dev-button.tsx idle state) so both entry
            // points feel like the same action, not two competing
            // affordances.
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-500/50 bg-gradient-to-br from-indigo-500/15 to-violet-500/20 px-3 text-xs font-medium text-violet-700 transition-colors hover:from-indigo-500/25 hover:to-violet-500/30 dark:text-violet-300"
          >
            {actionIcon}
            <span>{actionLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
