'use client';

/**
 * OperationLogsDrawer — slide-over panel that renders the full log history
 * for one long-running operation (cloud deploy or git-remote creation).
 *
 * Discoverability: the drawer opens from a small info-icon button tucked
 * next to the Deploy / Publish buttons. Never shown by default — only
 * when there's something to see.
 *
 * Polling: while the drawer is open and the underlying operation is
 * active (isRunning=true), we refetch every 1.5s so new entries stream in.
 * Once the operation finishes, polling stops and the view becomes static.
 *
 * No raw stdout dumps — each entry is a one-liner with an optional
 * "detail" (multi-line stderr, stack trace) rendered in a collapsible
 * block so the default view stays sleek.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bug, CircleCheck, Copy, Info, Loader2, TriangleAlert } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type OperationLogKindLiteral = 'CloudDeploy' | 'GitRemoteCreate';
export type OperationLogLevelLiteral = 'Debug' | 'Info' | 'Warn' | 'Error';

export interface OperationLogEntryDto {
  id: string;
  operationKind: OperationLogKindLiteral;
  operationId: string;
  level: OperationLogLevelLiteral;
  message: string;
  detail?: string;
  createdAt: string;
}

export interface OperationLogsDrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  kind: OperationLogKindLiteral;
  operationId: string;
  /** Human title shown in the sheet header. */
  title: string;
  /** Shown below the title — e.g. "Cloudflare Pages · app-slug". */
  subtitle?: string;
  /** When true, the drawer polls for new entries every 1.5s. */
  isRunning: boolean;
}

const LEVEL_ICON: Record<OperationLogLevelLiteral, { icon: typeof Info; className: string }> = {
  Debug: { icon: Bug, className: 'text-muted-foreground' },
  Info: { icon: Info, className: 'text-sky-500' },
  Warn: { icon: TriangleAlert, className: 'text-amber-500' },
  Error: { icon: AlertTriangle, className: 'text-destructive' },
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function OperationLogsDrawer({
  open,
  onOpenChange,
  kind,
  operationId,
  title,
  subtitle,
  isRunning,
}: OperationLogsDrawerProps) {
  const [entries, setEntries] = useState<OperationLogEntryDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/operations/${encodeURIComponent(kind)}/${encodeURIComponent(operationId)}/logs`
      );
      if (!res.ok) {
        const text = await res.text();
        setError(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        return;
      }
      const body = (await res.json()) as { entries?: OperationLogEntryDto[] };
      setEntries(body.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [kind, operationId]);

  // Fetch on open + poll while running.
  useEffect(() => {
    if (!open) return;
    void refresh();
    if (!isRunning) return;
    const timer = setInterval(() => {
      void refresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [open, isRunning, refresh]);

  // Auto-scroll to bottom while running so new entries are visible without
  // the user needing to chase them. Skip when the user is paused (not
  // running) so they can read historical entries without getting yanked.
  useEffect(() => {
    if (!isRunning || !open) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, isRunning, open]);

  const visible = useMemo(
    () => (showDebug ? entries : entries.filter((e) => e.level !== 'Debug')),
    [entries, showDebug]
  );

  const copyAll = useCallback(async () => {
    const text = entries
      .map((e) => {
        const base = `[${formatTime(e.createdAt)}] ${e.level.toUpperCase()} — ${e.message}`;
        return e.detail ? `${base}\n${e.detail}` : base;
      })
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ignore — secure context may be unavailable in some dev envs.
    }
  }, [entries]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg lg:max-w-2xl"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <DrawerHeaderIcon isRunning={isRunning} entries={entries} />
            {title}
          </SheetTitle>
          {subtitle ? <SheetDescription>{subtitle}</SheetDescription> : null}
          <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
            <span>
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
            <button
              type="button"
              className={cn(
                'cursor-pointer rounded px-1.5 py-0.5 text-[11px]',
                showDebug ? 'bg-muted text-foreground' : 'hover:bg-muted hover:text-foreground'
              )}
              onClick={() => setShowDebug((v) => !v)}
            >
              {showDebug ? 'Hide debug' : 'Show debug'}
            </button>
            <button
              type="button"
              className="hover:bg-muted hover:text-foreground inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
              onClick={() => void copyAll()}
              disabled={entries.length === 0}
            >
              <Copy className="size-3" />
              Copy all
            </button>
          </div>
        </SheetHeader>

        <div ref={bodyRef} className="flex-1 overflow-y-auto p-4">
          {loading && entries.length === 0 ? (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="size-3 animate-spin" /> Loading logs…
            </div>
          ) : null}
          {error ? (
            <div className="text-destructive bg-destructive/10 mb-3 rounded-md border p-2 text-xs">
              {error}
            </div>
          ) : null}
          {visible.length === 0 && !loading && !error ? (
            <div className="text-muted-foreground text-xs">
              No log entries yet.
              {isRunning ? ' The operation just started — entries will appear here.' : ''}
            </div>
          ) : null}

          <ol className="flex flex-col gap-2">
            {visible.map((entry) => {
              const { icon: Icon, className: levelClass } = LEVEL_ICON[entry.level];
              return (
                <li
                  key={entry.id}
                  className="border-border/60 hover:bg-muted/30 group rounded-md border p-2 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <Icon className={cn('mt-0.5 size-3.5 shrink-0', levelClass)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                          {formatTime(entry.createdAt)}
                        </span>
                        <span className="min-w-0 flex-1 text-xs leading-snug break-words">
                          {entry.message}
                        </span>
                      </div>
                      {entry.detail ? (
                        <details className="mt-1">
                          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-[10px]">
                            Details
                          </summary>
                          <pre className="bg-muted/50 mt-1 overflow-x-auto rounded px-2 py-1 font-mono text-[10px] whitespace-pre-wrap">
                            {entry.detail}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Header icon for the OperationLogsDrawer. The current outcome is what
 * the user cares about — NOT whether any old entry from a stale prior
 * run was an Error. Earlier code did `entries.some(e => e.level ===
 * 'Error')` which permanently poisoned the icon to a destructive
 * triangle the moment a single failure was logged, even if the next
 * deploy succeeded cleanly. Look at the LATEST entry instead and let
 * its level drive the icon. Running state still wins over everything.
 */
function DrawerHeaderIcon({
  isRunning,
  entries,
}: {
  isRunning: boolean;
  entries: readonly OperationLogEntryDto[];
}) {
  if (isRunning) {
    return <Loader2 className="text-primary size-4 animate-spin" />;
  }
  // Walk backwards to find the latest meaningful entry. Debug entries
  // don't change the headline status — they're noise.
  for (let i = entries.length - 1; i >= 0; i--) {
    const level = entries[i].level;
    if (level === 'Debug') continue;
    if (level === 'Error') {
      return <AlertTriangle className="text-destructive size-4" />;
    }
    if (level === 'Warn') {
      return <AlertTriangle className="size-4 text-amber-500" />;
    }
    // Info — operation finished cleanly
    return <CircleCheck className="size-4 text-emerald-500" />;
  }
  // No entries at all — neutral idle icon
  return <CircleCheck className="text-muted-foreground size-4" />;
}
