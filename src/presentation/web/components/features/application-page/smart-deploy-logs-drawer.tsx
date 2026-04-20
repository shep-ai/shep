'use client';

/**
 * SmartDeployLogsDrawer — unified activity log for the Smart Deploy
 * cluster. Every long-running operation that the button can trigger
 * writes to its own `operation_log_entries` scope on the server:
 *
 *   - GitRemoteCreate  — "Publish to GitHub" / "Get online" repo half
 *   - CloudDeploy      — "Publish to web" / "Get online" deploy half
 *   - RepoSync         — "Save & backup" commit+push pipeline
 *
 * This drawer fetches all three in parallel, merges them by
 * `createdAt`, and renders one chronologically-sorted stream so the
 * user sees a single unified timeline for the whole Smart Deploy
 * surface — no more guessing which operation the visible log drawer
 * is scoped to.
 *
 * Each row is tagged with a small colored "kind" chip so the source
 * of every entry stays obvious. A "Show debug" toggle hides Debug-level
 * entries by default; "Copy all" produces a plaintext dump suitable
 * for pasting into a bug report.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CircleCheck,
  Cloud,
  Copy,
  GitBranch,
  Github,
  Info,
  Loader2,
  Package,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useOperationLogAppend } from '@/hooks/agent-events-provider';
import { cn } from '@/lib/utils';
import type { OperationLogEntry } from '@shepai/core/domain/generated/output';

export type SmartOpKind = 'CloudDeploy' | 'GitRemoteCreate' | 'RepoSync' | 'ApplicationSetup';
type LogLevel = 'Debug' | 'Info' | 'Warn' | 'Error';

interface OperationLogEntryDto {
  id: string;
  operationKind: SmartOpKind;
  operationId: string;
  level: LogLevel;
  message: string;
  detail?: string;
  createdAt: string;
}

// The SSE-delivered `OperationLogEntry` carries `createdAt` as an `any`
// because the TypeSpec generator widens date-time fields. In practice
// it's an ISO string over the wire — coerce defensively so the drawer's
// `new Date(createdAt)` sort never hits NaN.
function toDto(entry: OperationLogEntry): OperationLogEntryDto {
  const createdAt =
    typeof entry.createdAt === 'string'
      ? entry.createdAt
      : entry.createdAt instanceof Date
        ? entry.createdAt.toISOString()
        : String(entry.createdAt);
  return {
    id: entry.id,
    operationKind: entry.operationKind as SmartOpKind,
    operationId: entry.operationId,
    level: entry.level as LogLevel,
    message: entry.message,
    detail: entry.detail,
    createdAt,
  };
}

const OP_KINDS: readonly SmartOpKind[] = [
  'ApplicationSetup',
  'GitRemoteCreate',
  'CloudDeploy',
  'RepoSync',
];

const KIND_META: Record<
  SmartOpKind,
  {
    label: string;
    icon: typeof Info;
    chipClass: string;
    iconClass: string;
    accentClass: string;
    labelClass: string;
  }
> = {
  ApplicationSetup: {
    label: 'setup',
    icon: Package,
    chipClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    iconClass: 'text-indigo-500',
    accentClass: 'bg-indigo-500/70',
    labelClass: 'text-indigo-500/80 dark:text-indigo-400/80',
  },
  GitRemoteCreate: {
    label: 'github',
    icon: Github,
    chipClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    iconClass: 'text-sky-500',
    accentClass: 'bg-sky-500/70',
    labelClass: 'text-sky-500/80 dark:text-sky-400/80',
  },
  CloudDeploy: {
    label: 'cloud',
    icon: Cloud,
    chipClass: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
    iconClass: 'text-fuchsia-500',
    accentClass: 'bg-fuchsia-500/70',
    labelClass: 'text-fuchsia-500/80 dark:text-fuchsia-400/80',
  },
  RepoSync: {
    label: 'sync',
    icon: GitBranch,
    chipClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    iconClass: 'text-emerald-500',
    accentClass: 'bg-emerald-500/70',
    labelClass: 'text-emerald-500/80 dark:text-emerald-400/80',
  },
};

const LEVEL_ICON: Record<LogLevel, { icon: typeof Info; className: string }> = {
  Debug: { icon: Bug, className: 'text-muted-foreground' },
  Info: { icon: Info, className: 'text-sky-500' },
  Warn: { icon: TriangleAlert, className: 'text-amber-500' },
  Error: { icon: AlertTriangle, className: 'text-destructive' },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export interface SmartDeployLogsDrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  applicationId: string;
  /** Whether the merged operation is currently live — used to pin the
   * spinner in the header and to auto-scroll as new entries arrive. */
  isRunning: boolean;
  /** Friendly subtitle, e.g. cloud provider name. */
  subtitle?: string;
}

const FETCH_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function SmartDeployLogsDrawer({
  open,
  onOpenChange,
  applicationId,
  isRunning,
  subtitle,
}: SmartDeployLogsDrawerProps) {
  const [entries, setEntries] = useState<OperationLogEntryDto[]>([]);
  // `hasLoadedOnce` splits "first load" from "background poll": the
  // "Loading logs…" spinner only shows while we've never completed a
  // fetch, so subsequent 1.5s polls don't flash the user back to a
  // loading state each tick when entries legitimately stay empty.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [backgroundFetching, setBackgroundFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    setBackgroundFetching(true);
    setError(null);
    try {
      // Fetch all three scopes in parallel with per-request timeouts.
      // Any single request failing (HTTP error, abort, network drop)
      // doesn't poison the drawer — we still merge what came back and
      // surface a soft error banner so the user knows something went
      // wrong without staring at a blank drawer forever.
      const results = await Promise.all(
        OP_KINDS.map(async (kind) => {
          try {
            const res = await fetchWithTimeout(
              `/api/operations/${encodeURIComponent(kind)}/${encodeURIComponent(applicationId)}/logs`
            );
            if (!res.ok) {
              return {
                kind,
                entries: [] as OperationLogEntryDto[],
                error: `${kind}: HTTP ${res.status}`,
              };
            }
            const body = (await res.json()) as { entries?: OperationLogEntryDto[] };
            return { kind, entries: body.entries ?? [], error: null as string | null };
          } catch (err) {
            const msg =
              err instanceof Error
                ? err.name === 'AbortError'
                  ? `${kind}: timed out after ${FETCH_TIMEOUT_MS / 1000}s`
                  : `${kind}: ${err.message}`
                : `${kind}: unknown error`;
            return { kind, entries: [] as OperationLogEntryDto[], error: msg };
          }
        })
      );
      const merged = results
        .flatMap((r) => r.entries)
        .sort((a, b) => {
          const ta = new Date(a.createdAt).getTime();
          const tb = new Date(b.createdAt).getTime();
          return ta - tb;
        });
      setEntries(merged);
      const errors = results.map((r) => r.error).filter((e): e is string => e !== null);
      setError(errors.length > 0 ? errors.join(' · ') : null);
    } finally {
      setBackgroundFetching(false);
      setHasLoadedOnce(true);
    }
  }, [applicationId]);

  // Fetch on open — one-shot hydration. Reset the "first-load" flag
  // when the drawer is closed OR the applicationId switches so the
  // user sees "Loading logs…" on the next fresh open, not a stale
  // "No activity yet" while the first new fetch is still in flight.
  //
  // Live updates are driven by the shared agent-events SSE stream
  // below — we never use a client timer to poll the log endpoint.
  useEffect(() => {
    if (!open) {
      setHasLoadedOnce(false);
      return;
    }
    void refresh();
  }, [open, refresh]);

  // Live updates: the backend publishes an `OperationLogAppended` SSE
  // event the instant a new `operation_log_entries` row is written
  // (see StreamAgentEventsUseCase + IOperationLogEventBus). We append
  // surgically — no round-trip to `/api/operations/.../logs` — and
  // dedup by `entry.id` in case the one-shot hydration fetch and the
  // SSE event race for the same row. Chronological order is enforced
  // on insert so a reconnect that delivers entries out-of-order still
  // renders in timestamp order.
  const appendedEntry = useOperationLogAppend(applicationId);
  useEffect(() => {
    if (!open) return;
    if (!appendedEntry) return;
    const entry = appendedEntry;
    setEntries((prev) => {
      if (prev.some((e) => e.id === entry.id)) return prev;
      const next = [...prev, toDto(entry)];
      next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return next;
    });
  }, [appendedEntry, open]);

  // Auto-scroll to bottom while running so new entries are visible
  // without the user chasing them. Paused otherwise so historical
  // browsing isn't yanked.
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
        const base = `[${formatTime(e.createdAt)}] ${KIND_META[e.operationKind].label} · ${e.level.toUpperCase()} — ${e.message}`;
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
            <HeaderStatusIcon isRunning={isRunning} entries={entries} />
            Smart Deploy · Activity
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
            <button
              type="button"
              className="hover:bg-muted hover:text-foreground inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] disabled:opacity-50"
              onClick={() => void refresh()}
              disabled={backgroundFetching}
              title="Refresh now"
            >
              <RefreshCw className={cn('size-3', backgroundFetching && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </SheetHeader>

        <div ref={bodyRef} className="flex-1 overflow-y-auto py-2">
          {!hasLoadedOnce ? (
            <div className="text-muted-foreground flex items-center gap-2 px-4 py-2 text-xs">
              <Loader2 className="size-3 animate-spin" /> Loading logs…
            </div>
          ) : null}
          {error ? (
            <div className="text-destructive/90 border-destructive/60 mx-2 mb-2 border-l-2 px-3 py-1.5 font-mono text-[11px] leading-snug">
              {error}
            </div>
          ) : null}
          {visible.length === 0 && hasLoadedOnce ? (
            <div className="text-muted-foreground px-4 py-2 text-xs">
              {error ? 'Could not load activity. Use Refresh to try again.' : 'No activity yet.'}
              {isRunning && !error ? ' The operation just started — entries will appear here.' : ''}
            </div>
          ) : null}

          <ol className="flex flex-col">
            {visible.map((entry) => {
              const { icon: LevelIcon, className: levelClass } = LEVEL_ICON[entry.level];
              const meta = KIND_META[entry.operationKind];
              const hasDetail = Boolean(entry.detail);
              const isLoud = entry.level === 'Warn' || entry.level === 'Error';
              return (
                <li
                  key={entry.id}
                  className={cn(
                    'group relative flex items-start gap-3 px-4 py-[3px] font-mono text-[11.5px] leading-[1.55] transition-colors',
                    'hover:bg-muted/40',
                    entry.level === 'Error' && 'bg-destructive/5'
                  )}
                >
                  {/* Thin kind-colored accent on the left edge */}
                  <span
                    aria-hidden
                    className={cn(
                      'pointer-events-none absolute top-1 bottom-1 left-0 w-[2px] rounded-r-sm',
                      meta.accentClass,
                      'opacity-70 group-hover:opacity-100'
                    )}
                  />

                  <span className="text-muted-foreground/70 shrink-0 pt-[2px] text-[10.5px] tabular-nums">
                    {formatTime(entry.createdAt)}
                  </span>

                  <span
                    className={cn(
                      'shrink-0 pt-[3px] text-[10px] tracking-wide uppercase select-none',
                      meta.labelClass
                    )}
                    title={entry.operationKind}
                  >
                    {meta.label}
                  </span>

                  {isLoud ? (
                    <LevelIcon className={cn('mt-[3px] size-3 shrink-0', levelClass)} />
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'break-words whitespace-pre-wrap',
                        entry.level === 'Error' && 'text-destructive',
                        entry.level === 'Warn' && 'text-amber-600 dark:text-amber-400',
                        entry.level === 'Debug' && 'text-muted-foreground'
                      )}
                    >
                      {entry.message}
                    </span>
                    {hasDetail ? (
                      <details className="mt-0.5 [&:not([open])_.caret-open]:hidden [&[open]_.caret-closed]:hidden">
                        <summary className="text-muted-foreground/70 hover:text-foreground inline-block cursor-pointer list-none text-[10px] [&::-webkit-details-marker]:hidden">
                          <span className="caret-closed">› details</span>
                          <span className="caret-open">‹ hide</span>
                        </summary>
                        <pre className="text-muted-foreground border-border/60 mt-0.5 ml-[1px] overflow-x-auto border-l pl-2 text-[10.5px] leading-[1.5] whitespace-pre-wrap">
                          {entry.detail}
                        </pre>
                      </details>
                    ) : null}
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

function HeaderStatusIcon({
  isRunning,
  entries,
}: {
  isRunning: boolean;
  entries: readonly OperationLogEntryDto[];
}) {
  if (isRunning) {
    return <Loader2 className="text-primary size-4 animate-spin" />;
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    const level = entries[i].level;
    if (level === 'Debug') continue;
    if (level === 'Error') return <AlertTriangle className="text-destructive size-4" />;
    if (level === 'Warn') return <AlertTriangle className="size-4 text-amber-500" />;
    return <CircleCheck className="size-4 text-emerald-500" />;
  }
  return <CircleCheck className="text-muted-foreground size-4" />;
}
