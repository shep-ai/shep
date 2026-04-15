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
  TriangleAlert,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type SmartOpKind = 'CloudDeploy' | 'GitRemoteCreate' | 'RepoSync';
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

const OP_KINDS: readonly SmartOpKind[] = ['GitRemoteCreate', 'CloudDeploy', 'RepoSync'];

const KIND_META: Record<
  SmartOpKind,
  { label: string; icon: typeof Info; chipClass: string; iconClass: string }
> = {
  GitRemoteCreate: {
    label: 'GitHub',
    icon: Github,
    chipClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    iconClass: 'text-sky-500',
  },
  CloudDeploy: {
    label: 'Cloud',
    icon: Cloud,
    chipClass: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
    iconClass: 'text-fuchsia-500',
  },
  RepoSync: {
    label: 'Sync',
    icon: GitBranch,
    chipClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    iconClass: 'text-emerald-500',
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
  /** When true, the drawer polls for new entries every 1.5s. */
  isRunning: boolean;
  /** Friendly subtitle, e.g. cloud provider name. */
  subtitle?: string;
}

export function SmartDeployLogsDrawer({
  open,
  onOpenChange,
  applicationId,
  isRunning,
  subtitle,
}: SmartDeployLogsDrawerProps) {
  const [entries, setEntries] = useState<OperationLogEntryDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all three scopes in parallel, then merge. Any single
      // request failing doesn't poison the drawer — we still show
      // what we have and surface a soft error banner.
      const responses = await Promise.all(
        OP_KINDS.map(async (kind) => {
          try {
            const res = await fetch(
              `/api/operations/${encodeURIComponent(kind)}/${encodeURIComponent(applicationId)}/logs`
            );
            if (!res.ok) return { kind, entries: [] as OperationLogEntryDto[] };
            const body = (await res.json()) as { entries?: OperationLogEntryDto[] };
            return { kind, entries: body.entries ?? [] };
          } catch {
            return { kind, entries: [] as OperationLogEntryDto[] };
          }
        })
      );
      const merged = responses
        .flatMap((r) => r.entries)
        .sort((a, b) => {
          const ta = new Date(a.createdAt).getTime();
          const tb = new Date(b.createdAt).getTime();
          return ta - tb;
        });
      setEntries(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

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
              No activity yet.
              {isRunning ? ' The operation just started — entries will appear here.' : ''}
            </div>
          ) : null}

          <ol className="flex flex-col gap-2">
            {visible.map((entry) => {
              const { icon: LevelIcon, className: levelClass } = LEVEL_ICON[entry.level];
              const meta = KIND_META[entry.operationKind];
              return (
                <li
                  key={entry.id}
                  className="border-border/60 hover:bg-muted/30 group rounded-md border p-2 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <LevelIcon className={cn('mt-0.5 size-3.5 shrink-0', levelClass)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                          {formatTime(entry.createdAt)}
                        </span>
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0 text-[9px] font-medium tracking-wide uppercase',
                            meta.chipClass
                          )}
                        >
                          <meta.icon className={cn('size-2.5', meta.iconClass)} />
                          {meta.label}
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
