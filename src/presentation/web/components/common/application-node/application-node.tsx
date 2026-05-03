'use client';

import { useCallback, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  ExternalLink,
  LayoutGrid,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
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
import { featureIdForApplication } from '@shepai/core/domain/shared/feature-id';
import { deriveAppLiveStatus } from '@/lib/derive-app-status';
import type { ApplicationNodeData } from './application-node-config';

/** Preview slot height. Used only when a deployment is actually Live —
 *  when the app is idle, we collapse to a single Run row so the card
 *  matches the repository node's vertical rhythm on the canvas. */
const PREVIEW_HEIGHT_PX = 180;

export function ApplicationNode({
  data,
  selected,
}: {
  data: ApplicationNodeData;
  selected?: boolean;
  [key: string]: unknown;
}) {
  const { i18n, t } = useTranslation('web');
  const isRtl = i18n.dir() === 'rtl';
  const targetHandlePos = isRtl ? Position.Right : Position.Left;
  const sourceHandlePos = isRtl ? Position.Left : Position.Right;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalRepoCount = 1 + data.additionalPathCount;
  const repoCountLabel = totalRepoCount === 1 ? '1 repository' : `${totalRepoCount} repositories`;

  // Live session turn status from the global SSE subscription. The
  // scope key is `app-<id>` — same key used everywhere else the
  // application's chat is referenced.
  const turnStatus = useTurnStatus(featureIdForApplication(data.id));

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

  const live = deriveAppLiveStatus(data.status, turnStatus, !!effectiveDeploymentUrl);

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
    <div
      className={cn('group relative', data.onDelete && data.id && 'ps-10')}
      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
    >
      {/* Target handle (left in LTR) — always rendered for edge connections */}
      <Handle
        type="target"
        position={targetHandlePos}
        isConnectable={false}
        className="opacity-0!"
        style={{ top: 70 }}
      />

      {/* Delete button — visible on hover, positioned just outside the card
          on the left. Uses the same inset offset as the repository node so
          the two card types align horizontally on the canvas. */}
      {data.onDelete && data.id ? (
        <>
          <div
            className="absolute -start-3 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
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
          selected && 'border-blue-400 dark:border-amber-500/60',
          !selected && live.borderClass
        )}
      >
        {/* Row 1: Header — icon, name, status, "+ New" action.
            Layout mirrors the repository node so apps and repos read
            as visual peers on the canvas. The "+ New" button is the
            primary entry point for creating a feature scoped to this
            application; it opens the same drawer the repo node opens
            (mode editable, repo locked to the app's repo). */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500">
            <LayoutGrid className="h-4 w-4 text-white" />
          </div>
          <span
            data-testid="application-node-name"
            className="min-w-0 truncate text-sm font-medium"
          >
            {data.name}
          </span>
          <span className="ms-auto flex shrink-0 items-center gap-2">
            <span className="flex items-center gap-1.5">
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
            {data.onCreateSddFeature && data.id ? (
              <span onClick={(e) => e.stopPropagation()}>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t('applicationNode.newFeature')}
                        data-testid="application-node-new-sdd-feature-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          data.onCreateSddFeature?.(data.id);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="nodrag flex h-6 shrink-0 cursor-pointer items-center gap-0.5 rounded bg-blue-500 px-1.5 text-[11px] font-bold text-white transition-colors hover:bg-blue-600 dark:bg-amber-500 dark:hover:bg-amber-400"
                      >
                        <Plus className="h-3 w-3" />
                        <span className="translate-y-px">{t('repositoryNode.new')}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t('applicationNode.newFeature')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            ) : null}
          </span>
        </div>

        {/* Row 2: Live preview iframe — only mounted when a deployment
            is actually Ready. When the app is idle / booting / errored
            we collapse this slot so the card matches the repository
            node's vertical rhythm; the dev-server status is surfaced
            on the Run row below instead of an oversized placeholder. */}
        {effectiveDeploymentUrl && deploy.status === DeploymentState.Ready ? (
          <div className="px-4 pb-2" onClick={stopCardClick}>
            <div
              className="bg-muted group/preview relative overflow-hidden rounded-lg"
              style={{ height: PREVIEW_HEIGHT_PX }}
            >
              <iframe
                src={effectiveDeploymentUrl}
                title={`${data.name} live preview`}
                className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-white"
                style={{
                  width: '250%',
                  height: '250%',
                  transform: 'scale(0.4)',
                }}
                sandbox="allow-same-origin allow-scripts"
                loading="lazy"
              />

              {/* Hover overlay — Stop + Open-in-new-tab cluster */}
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-neutral-900/75 opacity-0 transition-opacity duration-150 group-hover/preview:pointer-events-auto group-hover/preview:opacity-100 dark:bg-neutral-950/80"
                onPointerDown={stopCardClick}
                onClick={stopCardClick}
              >
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
            </div>
          </div>
        ) : null}

        {/* Row 3: Run / dev-server status — mirrors the repository
            node's "Run | start local environment | ▶" line so apps
            and repos read as visual peers. Carries every transient
            state (Booting / Stopping / Error) inline instead of
            inflating the card with a placeholder slot. */}
        <div
          data-testid="application-node-dev-preview"
          className="border-border/50 flex items-center gap-2 border-t px-4 py-2 text-xs"
          onClick={stopCardClick}
        >
          {deploy.deployError ? (
            <span className="truncate text-xs text-red-500">{deploy.deployError}</span>
          ) : deploy.status === DeploymentState.Booting || deploy.deployLoading ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-500" />
              <span>Starting…</span>
            </span>
          ) : deploy.stopLoading ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              <span>Stopping…</span>
            </span>
          ) : effectiveDeploymentUrl ? (
            <>
              <span className="me-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" />
              <a
                href={effectiveDeploymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-green-700 hover:underline dark:text-green-400"
                onClick={openPreviewInNewTab}
              >
                {effectiveDeploymentUrl}
              </a>
            </>
          ) : (
            <span className="text-muted-foreground inline-flex items-baseline gap-2">
              <span>Run</span>
              <span className="text-muted-foreground/50 text-[10px]">start local environment</span>
            </span>
          )}
          <span className="ms-auto flex items-center gap-1">
            <span data-testid="application-node-repo-count" className="text-muted-foreground/70">
              {repoCountLabel}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (deploy.deployError) {
                        void deploy.deploy();
                        return;
                      }
                      if (effectiveDeploymentUrl) {
                        void deploy.stop();
                        return;
                      }
                      void deploy.deploy();
                    }}
                    onPointerDown={stopCardClick}
                    disabled={deploy.deployLoading || deploy.stopLoading}
                    aria-label={
                      deploy.deployError
                        ? 'Retry'
                        : effectiveDeploymentUrl
                          ? 'Stop dev server'
                          : 'Start dev server'
                    }
                    className={cn(
                      'text-muted-foreground hover:bg-muted flex h-6 w-6 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                      !effectiveDeploymentUrl &&
                        !deploy.deployError &&
                        'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300'
                    )}
                  >
                    {deploy.deployLoading || deploy.stopLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : deploy.deployError ? (
                      <RotateCcw className="h-3 w-3" />
                    ) : effectiveDeploymentUrl ? (
                      <Square className="h-3 w-3 fill-current" />
                    ) : (
                      <Play className="h-3 w-3 fill-current" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {deploy.deployError
                    ? 'Failed — click to retry'
                    : effectiveDeploymentUrl
                      ? 'Stop dev server'
                      : 'Start dev server'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
        </div>
      </div>

      {/* Source handle (right in LTR) — hosts the "New SDD feature" action
          button when a callback is wired, mirroring the feature-node pattern.
          Falls back to a hidden handle when no callback is provided so edge
          connections still attach to the same coordinate. */}
      {/* Source handle — invisible edge anchor for child feature edges.
          The user-facing "+ New" affordance is in the header (matching
          the repository node), not on this handle. */}
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
