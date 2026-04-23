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
import { ExternalLink, Globe, Hammer, Loader2, Play, Square, TriangleAlert } from 'lucide-react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import type { DeployActionState } from '@/hooks/use-deploy-action';

export interface WebPreviewTabProps {
  deploy: DeployActionState;
  /**
   * True while the agent / scaffolder is still producing the app.
   * Supersedes the idle / ready states and shows a friendly "Building
   * your app…" placeholder so the Web tab has something meaningful
   * even before a single file has been written.
   */
  isBuilding?: boolean;
}

export function WebPreviewTab({ deploy, isBuilding = false }: WebPreviewTabProps) {
  const openInNewTab = useCallback(() => {
    if (deploy.url) window.open(deploy.url, '_blank', 'noopener,noreferrer');
  }, [deploy.url]);

  // While the project tree is still being produced we own this pane —
  // no iframe, no "Start preview" CTA, just a soft progress placeholder
  // so the Web tab feels alive from the first moment the user lands.
  if (isBuilding && deploy.status !== DeploymentState.Ready) {
    return <BuildingStub />;
  }

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
            className="text-muted-foreground hover:text-foreground hover:bg-background/60 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors dark:hover:bg-neutral-800"
            title="Open in a new browser tab"
          >
            <ExternalLink className="h-3 w-3" />
            <span>Open</span>
          </button>
          {/* Stop control — lives here (inside the Web pane) instead of
              on the tab itself so it never interferes with click-to-switch.
              The user only needs Stop while looking at the live preview,
              which is exactly when they're on this tab. */}
          <button
            type="button"
            onClick={deploy.stop}
            disabled={deploy.stopLoading}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            title="Stop the dev server"
            aria-label="Stop the dev server"
          >
            {deploy.stopLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Square className="h-3 w-3 fill-current" />
            )}
            <span>Stop</span>
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

  // Idle — CTA kicks off the dev server. Doubles as the redundant
  // entry point for users who land here from the IDE/Terminal tabs and
  // want to see the preview — clicking the Web tab itself ALSO starts
  // the dev server (see app-view-tabs.tsx), so this is the "I'm
  // already here, just start it" affordance.
  return (
    <EmptyState
      icon={<Globe className="text-muted-foreground h-8 w-8" />}
      title="No live preview yet"
      description="Click Start preview to install dependencies and run the app locally. Your live preview will appear here."
      actionLabel="Start preview"
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

/**
 * "Building your app…" placeholder for the Web pane — visible while
 * the scaffolder or the agent is still producing the app. A sibling
 * of EmptyState but with its own richer visual so it reads as an
 * active progress stub rather than an error-adjacent empty state.
 */
function BuildingStub() {
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="from-primary/10 via-background to-background pointer-events-none absolute inset-0 bg-gradient-to-br"
      />
      <div
        aria-hidden
        className="bg-[radial-gradient(circle,theme(colors.muted.DEFAULT)_1px,transparent_1px)] pointer-events-none absolute inset-0 [background-size:24px_24px] opacity-20"
      />
      <div className="relative flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="bg-background border-border ring-primary/10 relative inline-flex size-12 items-center justify-center rounded-full border shadow-sm ring-4">
          <Hammer className="text-primary size-5" />
          <span className="bg-primary absolute -end-1 -top-1 inline-flex size-3 items-center justify-center rounded-full">
            <Loader2 className="text-primary-foreground size-2.5 animate-spin" />
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-foreground text-sm font-semibold">Building your app…</h3>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Setting up the project tree, installing dependencies, and generating components. Your
            live preview will land here the moment the app is ready.
          </p>
        </div>
        <div className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
          <Loader2 className="size-3 animate-spin" />
          <span>Working on it</span>
        </div>
      </div>
    </div>
  );
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
            className="border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 mt-2 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors"
          >
            {actionIcon}
            <span>{actionLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
