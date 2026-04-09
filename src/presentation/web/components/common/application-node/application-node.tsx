'use client';

import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { LayoutGrid, Trash2 } from 'lucide-react';
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
import type { ApplicationNodeData } from './application-node-config';

/**
 * Pick the effective status for the card's status pill by folding the
 * LIVE interactive-session turn status into the persisted
 * `application.status`:
 *
 *   - `processing`      → "Working"  (agent is actively running a turn)
 *   - `awaiting_input`  → "Waiting"  (agent blocked on user interaction)
 *   - `unread`          → "Ready"    (agent finished a turn you haven't read)
 *   - anything else     → fall back to `data.status` ("Idle" / "Error")
 *
 * The persisted `application.status` column is a coarse snapshot that
 * only changes on explicit transitions; without live folding, the
 * card (and the app page top bar) was stuck saying "Idle" even while
 * the agent was clearly running tool after tool.
 */
function deriveLiveStatus(
  persistedStatus: string,
  turnStatus: string
): { label: string; dotClass: string; pulse: boolean } {
  if (turnStatus === 'processing') {
    return { label: 'Working', dotClass: 'bg-violet-500', pulse: true };
  }
  if (turnStatus === 'awaiting_input') {
    return { label: 'Waiting', dotClass: 'bg-amber-500', pulse: true };
  }
  if (turnStatus === 'unread') {
    return { label: 'Ready', dotClass: 'bg-emerald-500', pulse: false };
  }
  // Fall through to the persisted coarse status.
  if (persistedStatus === 'Active') {
    return { label: 'Active', dotClass: 'bg-green-500', pulse: false };
  }
  if (persistedStatus === 'Error') {
    return { label: 'Error', dotClass: 'bg-red-500', pulse: false };
  }
  return { label: 'Idle', dotClass: 'bg-muted-foreground/40', pulse: false };
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
  const live = deriveLiveStatus(data.status, turnStatus);

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
        {/* Row 1: Header — icon, name, status */}
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

        {/* Row 2: Preview slot — live iframe when the dev server is
            Running, wireframe skeleton otherwise. The iframe is
            scaled down with a CSS transform so the full browser
            viewport fits inside the 120px preview without horizontal
            clipping; `pointer-events-none` ensures the card stays
            draggable and clickable (you click the card, not into the
            running app). */}
        <div className="px-3 pb-2">
          <div className="bg-muted relative h-[120px] overflow-hidden rounded-lg">
            {data.deploymentUrl ? (
              <>
                <iframe
                  src={data.deploymentUrl}
                  title={`${data.name} live preview`}
                  // 2.5× inner size scaled to 0.4 = exactly 1.0
                  // effective size. The iframe renders at a real
                  // browser viewport (good enough for responsive
                  // landing pages) and gets scaled into our slot.
                  className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white"
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
                {/* Live badge so the user immediately sees this is
                    real and not a mock. Sits above the iframe. */}
                <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700 backdrop-blur dark:text-violet-300">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
                  </span>
                  <span>Live</span>
                </div>
              </>
            ) : (
              <>
                {/* Wireframe skeleton mimicking a web app */}
                <div
                  className="flex h-6 items-center gap-2 px-2"
                  style={{ background: 'var(--muted)' }}
                >
                  <div className="bg-muted-foreground/10 h-2 w-2 rounded-full" />
                  <div className="bg-muted-foreground/10 h-2 w-2 rounded-full" />
                  <div className="bg-muted-foreground/10 h-2 w-2 rounded-full" />
                  <div className="bg-muted-foreground/10 ms-2 h-2 w-16 rounded" />
                </div>
                <div className="flex h-[calc(120px-1.5rem)]">
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
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row 3: Bottom — repository count */}
        <div className="px-4 pb-3">
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
