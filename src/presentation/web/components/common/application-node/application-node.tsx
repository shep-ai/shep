'use client';

import { useCallback, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  ExternalLink,
  LayoutGrid,
  Loader2,
  Play,
  Square,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTurnStatus } from '@/hooks/turn-statuses-provider';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import type { ApplicationNodeData } from './application-node-config';

/** Preview slot height. Roomier than the old 120px to give the live
 *  iframe / start-preview CTA more presence on the canvas. */
const PREVIEW_HEIGHT_PX = 180;

/**
 * Pick the effective status for the card's status pill. "Idle" is
 * never shown. The fallback when nothing is actively happening is
 * "Ready" (standby) — unless the dev server is running, in which
 * case "Live" takes over as the persistent resting state.
 *
 * Priority (highest wins):
 *
 *   - `processing`      → "In Progress"  (agent actively running a turn)
 *   - `awaiting_input`  → "Warning"      (agent blocked on user question)
 *   - deploymentUrl set → "Live"         (dev server running at a real URL)
 *   - persisted Error   → "Error"
 *   - otherwise         → "Ready"        (agent finished, preview not running)
 *
 * Note the `unread` turn status intentionally collapses into the
 * default branch — when the agent just finished a turn but the user
 * hasn't scrolled back to read it, we still show Ready (or Live if
 * the dev server is up). The user is already looking at the card,
 * a "you have unread output" nag adds no information.
 */
function deriveLiveStatus(
  persistedStatus: string,
  turnStatus: string,
  deploymentUrl: string | undefined
): { label: string; dotClass: string; pulse: boolean } {
  if (turnStatus === 'processing') {
    return { label: 'In Progress', dotClass: 'bg-violet-500', pulse: true };
  }
  if (turnStatus === 'awaiting_input') {
    return { label: 'Warning', dotClass: 'bg-amber-500', pulse: true };
  }
  if (deploymentUrl) {
    return { label: 'Live', dotClass: 'bg-emerald-500', pulse: true };
  }
  if (persistedStatus === 'Error') {
    return { label: 'Error', dotClass: 'bg-red-500', pulse: false };
  }
  return { label: 'Ready', dotClass: 'bg-sky-500', pulse: false };
}

export function ApplicationNode({
  data,
  selected,
}: {
  data: ApplicationNodeData;
  selected?: boolean;
  [key: string]: unknown;
}) {
  const { i18n } = useTranslation('web');
  const isRtl = i18n.dir() === 'rtl';
  const targetHandlePos = isRtl ? Position.Right : Position.Left;
  const sourceHandlePos = isRtl ? Position.Left : Position.Right;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalRepoCount = 1 + data.additionalPathCount;
  const repoCountLabel = totalRepoCount === 1 ? '1 repository' : `${totalRepoCount} repositories`;

  // Live session turn status from the global SSE subscription. The
  // scope key is `app-<id>` — same key used everywhere else the
  // application's chat is referenced.
  const turnStatus = useTurnStatus(`app-${data.id}`);

  // Shared dev-server deploy state — one per card. Subscribes to the
  // `DeploymentStatusProvider` which is SSR-seeded in the dashboard
  // layout from `ListDeploymentsUseCase`, so running apps render as
  // "Live" on the first paint without a client round-trip.
  //
  // The card's Preview button drives this hook and the `live.label`
  // below is derived from the SAME state (via `deploy.url`), so the
  // status pill, the preview slot, and the button are always in
  // sync — hitting the button on one card can never leave the card
  // itself showing a stale "Ready" state.
  const deploy = useDeployAction({
    targetId: data.id,
    targetType: 'application',
    repositoryPath: data.repositoryPath,
  });

  // The hook is the single source of truth for the running URL.
  //
  // The shared `DeploymentStatusProvider` is seeded from SSR
  // (`get-graph-data` → `ListDeploymentsUseCase`) so the entry for
  // this application is already populated on the first client render,
  // and `ensureHydrated` catches anything the SSR seed missed. On
  // Stop the hook clears `deploy.url` to null which immediately
  // collapses the pill from "Live" back to "Ready" — there is
  // intentionally no secondary snapshot URL that could stay stale.
  const effectiveDeploymentUrl = deploy.url;

  const live = deriveLiveStatus(data.status, turnStatus, effectiveDeploymentUrl ?? undefined);

  // Clicking anything in the "card controls" zone (Preview button,
  // open-in-new-tab) must not trigger the card's navigation-to-app
  // click handler. A single stopPropagation wrapper keeps every
  // control inside the card safe without individually guarding each
  // one.
  const stopCardClick = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
  }, []);

  const openPreviewInNewTab = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (effectiveDeploymentUrl) {
        window.open(effectiveDeploymentUrl, '_blank', 'noopener,noreferrer');
      }
    },
    [effectiveDeploymentUrl]
  );

  return (
    <div className="group relative" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      {/* Target handle (left in LTR) — always rendered for edge connections */}
      <Handle
        type="target"
        position={targetHandlePos}
        isConnectable={false}
        className="opacity-0!"
        style={{ top: 70 }}
      />

      {/* Delete button — visible on hover, positioned outside the card on the left */}
      {data.onDelete && data.id ? (
        <>
          <div
            className="absolute -start-14 top-0 bottom-0 flex items-center justify-center ps-4 pe-3 opacity-0 transition-opacity group-hover:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="Remove application"
                    data-testid="application-node-delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmOpen(true);
                    }}
                    className="bg-card text-muted-foreground hover:border-destructive hover:text-destructive flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Remove application</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="max-w-xs">
              <DialogHeader>
                <DialogTitle>Remove application?</DialogTitle>
                <DialogDescription>
                  This will remove <strong>{data.name}</strong> from your workspace.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmOpen(false);
                    data.onDelete?.(data.id);
                  }}
                >
                  Remove
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        data-testid="application-node-card"
        data-app-name={data.name}
        onClick={(e) => {
          e.stopPropagation();
          data.onClick?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            data.onClick?.();
          }
        }}
        className={cn(
          'nodrag bg-card flex w-[26rem] cursor-pointer flex-col overflow-hidden rounded-xl border shadow-sm transition-[border-color,box-shadow] duration-200 dark:bg-neutral-800/80',
          selected && 'border-blue-400 dark:border-amber-500/60'
        )}
      >
        {/* Row 1: Header — icon, name, status.
            Padding matches the preview slot below so the card has
            consistent vertical rhythm now that the preview is
            taller. */}
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500">
            <LayoutGrid className="h-4 w-4 text-white" />
          </div>
          <span
            data-testid="application-node-name"
            className="min-w-0 truncate text-sm font-medium"
          >
            {data.name}
          </span>
          <span className="ms-auto flex shrink-0 items-center gap-1.5">
            <span
              data-testid="application-node-status-dot"
              className={cn(
                'relative flex h-2 w-2 items-center justify-center rounded-full',
                live.dotClass
              )}
            >
              {live.pulse ? (
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                    live.dotClass
                  )}
                />
              ) : null}
            </span>
            <span
              data-testid="application-node-status-text"
              className="text-muted-foreground text-xs"
            >
              {live.label}
            </span>
          </span>
        </div>

        {/* Row 2: Preview slot — the control hub for the dev server.
            One rectangle carries every state:
              - Live:    iframe + [stop][open-in-new-tab] pinned top-right
              - Booting: centered spinner + "Starting…"
              - Stopping: centered spinner + "Stopping…"
              - Error:   centered triangle + error label
              - Idle:    grayed wireframe (future: last screenshot),
                         hover overlay with a big "Start Preview" CTA
            `pointer-events-none` on the iframe keeps the card
            draggable — the iframe swallows no clicks. */}
        <div className="px-4 pb-4">
          <div
            className="bg-muted group/preview relative overflow-hidden rounded-lg"
            style={{ height: PREVIEW_HEIGHT_PX }}
          >
            {/* ── Underlay: iframe when Live, else wireframe ───── */}
            {effectiveDeploymentUrl ? (
              <iframe
                src={effectiveDeploymentUrl}
                title={`${data.name} live preview`}
                // 2.5× inner size scaled to 0.4 = exactly 1.0
                // effective size. The iframe renders at a real
                // browser viewport (good enough for responsive
                // landing pages) and gets scaled into our slot.
                className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-white"
                style={{
                  width: '250%',
                  height: '250%',
                  transform: 'scale(0.4)',
                }}
                // Run the app in a sandbox with only what a static
                // Vite dev bundle needs: same-origin (for HMR
                // websockets on localhost) + script execution. No
                // form submission, no top-level navigation, no
                // modal dialogs.
                sandbox="allow-same-origin allow-scripts"
                loading="lazy"
              />
            ) : (
              // Offline underlay — grayed wireframe (placeholder for
              // a real captured screenshot, see TODO in the
              // components/config comment). Grayscale + low opacity
              // signals "this is not a live image".
              <div className="pointer-events-none absolute inset-0 opacity-50 grayscale">
                <div
                  className="flex h-6 items-center gap-2 px-2"
                  style={{ background: 'var(--muted)' }}
                >
                  <div className="bg-muted-foreground/10 h-2 w-2 rounded-full" />
                  <div className="bg-muted-foreground/10 h-2 w-2 rounded-full" />
                  <div className="bg-muted-foreground/10 h-2 w-2 rounded-full" />
                  <div className="bg-muted-foreground/10 ms-2 h-2 w-16 rounded" />
                </div>
                <div className="flex h-[calc(100%-1.5rem)]">
                  {/* Sidebar */}
                  <div className="border-muted-foreground/5 flex w-[50px] flex-col gap-2 border-e p-2">
                    <div className="bg-muted-foreground/10 h-2 w-full rounded" />
                    <div className="bg-muted-foreground/10 h-2 w-3/4 rounded" />
                    <div className="bg-muted-foreground/10 h-2 w-full rounded" />
                  </div>
                  {/* Main content */}
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="bg-muted-foreground/10 h-2.5 w-2/3 rounded" />
                    <div className="bg-muted-foreground/10 h-2 w-full rounded" />
                    <div className="bg-muted-foreground/10 h-2 w-5/6 rounded" />
                    <div className="bg-muted-foreground/10 h-2 w-3/4 rounded" />
                    <div className="bg-muted-foreground/10 h-2 w-2/3 rounded" />
                  </div>
                </div>
              </div>
            )}

            {/* ── Overlays, pinned by deploy state ─────────────── */}

            {/* Live — centered Stop + Open-in-new-tab cluster,
                revealed on hover with an opaque dark surface.
                NOTE: we deliberately do NOT use `backdrop-blur` on
                top of the iframe — the iframe is rendered with
                `transform: scale(0.4)` which rasterizes its edges
                at subpixel boundaries, and CSS backdrop-filter
                picks those up and produces ugly banding / bleed
                (e.g. a stray green smudge from the real page
                behind it). A plain opaque fill is cleaner. */}
            {deploy.status === DeploymentState.Ready && effectiveDeploymentUrl ? (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-neutral-900/75 opacity-0 transition-opacity duration-150 group-hover/preview:pointer-events-auto group-hover/preview:opacity-100 dark:bg-neutral-950/80"
                onPointerDown={stopCardClick}
                onClick={stopCardClick}
              >
                {/* Solid backgrounds (no /90) — sitting on top of a
                    transform-scaled iframe, any alpha-transparent
                    surface rasterizes with fuzzy edges. Fully
                    opaque white/neutral fills render cleanly. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deploy.stop();
                  }}
                  disabled={deploy.stopLoading}
                  aria-label="Stop dev server"
                  title="Stop dev server"
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 shadow-md transition-colors hover:border-red-500 hover:bg-red-50 hover:text-red-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-red-500 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  {deploy.stopLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Square className="h-3.5 w-3.5 fill-current" />
                  )}
                  <span>Stop</span>
                </button>
                <button
                  type="button"
                  onClick={openPreviewInNewTab}
                  aria-label={`Open ${data.name} in a new tab`}
                  title={effectiveDeploymentUrl}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 shadow-md transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open</span>
                </button>
              </div>
            ) : null}

            {/* Booting — centered spinner, always visible (no hover
                gate). Amber matches the "transient waiting" palette
                used by the top-bar Preview button. Solid surface
                (no backdrop-blur) to avoid rasterization artifacts. */}
            {deploy.status === DeploymentState.Booting || deploy.deployLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-100 dark:bg-neutral-900">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                <span className="text-foreground text-xs font-medium">Starting…</span>
              </div>
            ) : null}

            {/* Stopping — centered spinner while the Stop request
                resolves. Separate from Booting so the label can be
                different; visually similar otherwise. */}
            {deploy.stopLoading && deploy.status === DeploymentState.Ready ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-900/75 dark:bg-neutral-950/80">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-100" />
                <span className="text-xs font-medium text-neutral-100">Stopping…</span>
              </div>
            ) : null}

            {/* Error — centered triangle + clickable retry hint.
                Stays visible until the user retries, so a failed
                boot doesn't silently disappear. */}
            {!deploy.deployLoading &&
            !deploy.stopLoading &&
            deploy.status !== DeploymentState.Booting &&
            deploy.status !== DeploymentState.Ready &&
            deploy.deployError ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void deploy.deploy();
                }}
                onPointerDown={stopCardClick}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-100 transition-colors hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800"
              >
                <TriangleAlert className="h-8 w-8 text-red-500" />
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  Failed — click to retry
                </span>
              </button>
            ) : null}

            {/* Idle — hover overlay with a big "Start Preview" CTA.
                Appears only on hover of the preview slot (not the
                whole card) so just hovering the card title doesn't
                flash it. Uses the Shep AI purple palette to match
                the page top-bar Preview button. Solid overlay so
                edges stay crisp against the wireframe underneath. */}
            {!effectiveDeploymentUrl &&
              !deploy.deployLoading &&
              deploy.status !== DeploymentState.Booting &&
              !deploy.deployError && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-900/75 opacity-0 transition-opacity duration-150 group-hover/preview:pointer-events-auto group-hover/preview:opacity-100 dark:bg-neutral-950/80">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deploy.deploy();
                    }}
                    onPointerDown={stopCardClick}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-violet-400 bg-gradient-to-br from-indigo-500 to-violet-600 px-4 text-xs font-semibold text-white shadow-md transition-[filter] hover:brightness-110"
                    aria-label="Start dev server preview"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Start Preview</span>
                  </button>
                </div>
              )}
          </div>
        </div>

        {/* Row 3: Bottom — just the repository count. All deploy
            controls (Start / Stop / Open) now live on the preview
            slot above so the footer stays quiet. */}
        <div className="px-4 pb-4">
          <span data-testid="application-node-repo-count" className="text-muted-foreground text-xs">
            {repoCountLabel}
          </span>
        </div>
      </div>

      {/* Source handle (right in LTR) — always rendered for edge connections */}
      <Handle
        type="source"
        position={sourceHandlePos}
        isConnectable={false}
        className="opacity-0!"
        style={{ top: 70 }}
      />
    </div>
  );
}
