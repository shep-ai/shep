'use client';

/**
 * OperationBubble
 *
 * In-chat card for a long-running application operation — "Publish
 * to GitHub" (GitRemoteCreate) or "Deploy to cloud" (CloudDeploy).
 *
 * Visual contract mirrors `TurnGroupCard`:
 *
 * - **Collapsed by default**: header only (icon, friendly title,
 *   event count, status badge, chevron). Users click to expand.
 * - **In-progress** (last log entry < 10s old): auto-expanded with
 *   a spinning fuchsia/sky header and a scrollable live-tail of
 *   the latest entries, so the user sees work streaming in place.
 *   Matches the in-progress TurnGroupCard styling.
 * - **Done / failed**: collapsed by default with a static badge
 *   (emerald check / amber warning / rose cross). Expand to see
 *   the full log inline with per-entry timestamps.
 *
 * Source of truth: the existing `/api/operations/:kind/:id/logs`
 * endpoint backed by `operation_log_entries`. Polls on a 1.5s
 * interval only while `in-progress`; goes static otherwise.
 *
 * Obeys the three-layer rule in `CLAUDE.md`: no auto-opened
 * sidebar drawer — the card is the in-place status indicator.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Github,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { OperationLogKind } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';

interface OperationLogEntryDto {
  id: string;
  operationKind: string;
  operationId: string;
  level: string;
  message: string;
  detail?: string;
  createdAt: string;
}

interface OperationBubbleProps {
  applicationId: string;
  kind: 'publish' | 'deploy' | 'sync';
}

/**
 * Split a flat list of operation log entries into one array per
 * "run". A run boundary is detected by an OUTER start marker — one
 * of a small, fixed whitelist of messages emitted exactly once per
 * use case invocation by the run-owning use case itself:
 *
 *   • `create-git-remote.use-case.ts`        → "Starting GitHub repository creation"
 *   • `initiate-cloud-deployment.use-case.ts`→ "Starting deploy to <providerId>"
 *   • `sync-repo.use-case.ts`                → "Starting save & backup"
 *
 * We deliberately DON'T split on any line that happens to begin
 * with "Starting ", because cloud providers emit their own inner
 * progress markers (e.g. "Starting Cloudflare Pages deploy for …")
 * via the onLog callback. Those are part of the same run — not a
 * new one — and splitting on them produced the "ghost" duplicate
 * deploy bubble users were seeing.
 *
 * Orphan entries before the first whitelisted marker (legacy rows
 * from before this convention existed) are attached to the first
 * real run so we never drop data on the floor.
 */
const OUTER_START_MARKERS: readonly string[] = [
  'Starting GitHub repository creation',
  'Starting deploy to ',
  'Starting save & backup',
];

function isOuterStartMarker(message: string): boolean {
  return OUTER_START_MARKERS.some((marker) => message.startsWith(marker));
}

function splitIntoRuns(entries: OperationLogEntryDto[]): OperationLogEntryDto[][] {
  if (entries.length === 0) return [];
  const runs: OperationLogEntryDto[][] = [];
  let current: OperationLogEntryDto[] = [];
  for (const e of entries) {
    if (isOuterStartMarker(e.message) && current.length > 0) {
      runs.push(current);
      current = [];
    }
    current.push(e);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

const KIND_TO_OP: Record<OperationBubbleProps['kind'], string> = {
  publish: OperationLogKind.GitRemoteCreate,
  deploy: OperationLogKind.CloudDeploy,
  sync: OperationLogKind.RepoSync,
};

const KIND_META = {
  publish: {
    title: 'Published to GitHub',
    inProgressTitle: 'Publishing to GitHub…',
    icon: Github,
    idleAccent: 'bg-sky-500/15 text-sky-500',
    liveGradient: 'border-sky-500/40 bg-gradient-to-br from-sky-500/5 via-sky-500/5 to-cyan-500/5',
    liveChip: 'bg-gradient-to-br from-sky-500 via-blue-500 to-cyan-500 text-white shadow-sm',
    liveText: 'text-sky-700 dark:text-sky-300',
  },
  deploy: {
    title: 'Deployed to cloud',
    inProgressTitle: 'Deploying to cloud…',
    icon: Cloud,
    idleAccent: 'bg-fuchsia-500/15 text-fuchsia-500',
    liveGradient:
      'border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-500/5 via-purple-500/5 to-sky-500/5',
    liveChip: 'bg-gradient-to-br from-fuchsia-500 via-purple-500 to-sky-500 text-white shadow-sm',
    liveText: 'text-fuchsia-700 dark:text-fuchsia-300',
  },
  sync: {
    title: 'Saved & pushed to GitHub',
    inProgressTitle: 'Saving & pushing to GitHub…',
    icon: RefreshCw,
    idleAccent: 'bg-emerald-500/15 text-emerald-500',
    liveGradient:
      'border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 via-emerald-500/5 to-teal-500/5',
    liveChip: 'bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-sm',
    liveText: 'text-emerald-700 dark:text-emerald-300',
  },
} as const;

async function fetchLogs(applicationId: string, kind: OperationBubbleProps['kind']) {
  const opKind = KIND_TO_OP[kind];
  const res = await fetch(
    `/api/operations/${encodeURIComponent(opKind)}/${encodeURIComponent(applicationId)}/logs`
  );
  if (!res.ok) return { entries: [] as OperationLogEntryDto[] };
  return (await res.json()) as { entries: OperationLogEntryDto[] };
}

type BubbleStatus = 'in-progress' | 'success' | 'failed' | 'warn' | 'empty';

function deriveStatus(entries: OperationLogEntryDto[]): BubbleStatus {
  if (entries.length === 0) return 'empty';
  const last = entries[entries.length - 1];
  const lastAtMs = new Date(last.createdAt).getTime();
  const ageMs = Date.now() - lastAtMs;
  if (ageMs < 10_000) return 'in-progress';
  switch (last.level) {
    case 'Error':
      return 'failed';
    case 'Warn':
      return 'warn';
    default:
      return 'success';
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** One contiguous execution of publish or deploy — a single bubble. */
export interface OperationRun {
  /** Stable id (first entry's id). Use as React key. */
  id: string;
  kind: OperationBubbleProps['kind'];
  /** Epoch ms of the first entry — used for chronological merge. */
  startedAt: number;
  entries: OperationLogEntryDto[];
}

/**
 * Fetches all log entries for this (application, kind) pair and
 * splits them into one `OperationRun` per contiguous execution.
 * Each republish / redeploy produces a fresh run so the caller can
 * render them as separate bubbles, interleaved chronologically with
 * user-turn cards by `startedAt`.
 *
 * Polling is driven by the LAST run only — older runs are terminal
 * and can't change state.
 */
export function useOperationRuns(
  applicationId: string | undefined,
  kind: OperationBubbleProps['kind']
): OperationRun[] {
  const { data } = useQuery({
    queryKey: ['operation-logs', applicationId ?? '', kind] as const,
    queryFn: () =>
      applicationId
        ? fetchLogs(applicationId, kind)
        : Promise.resolve({ entries: [] as OperationLogEntryDto[] }),
    enabled: Boolean(applicationId),
    // Two-speed polling:
    //   • 1500 ms while the LAST run is still in-progress — the
    //     user is actively watching a live bubble.
    //   • 2500 ms at all other times (including when there are no
    //     entries yet). This is the critical one: when the user
    //     clicks Save & Redeploy from the smart-deploy cluster, the
    //     new "Starting …" entry is written by the server but the
    //     query has nothing in-flight to trigger a refetch. Without
    //     a baseline idle interval the new bubble wouldn't appear
    //     until the next manual refresh. 2500 ms is fast enough to
    //     feel immediate (the button's own progress chip holds
    //     attention for a beat) and slow enough to be cheap.
    refetchInterval: (q) => {
      const entries = q.state.data?.entries ?? [];
      if (entries.length === 0) return 2500;
      const runs = splitIntoRuns(entries);
      const lastRun = runs[runs.length - 1] ?? [];
      const status = deriveStatus(lastRun);
      return status === 'in-progress' ? 1500 : 2500;
    },
    staleTime: 0,
  });

  return useMemo<OperationRun[]>(() => {
    const split = splitIntoRuns(data?.entries ?? []);
    return split.map((run, idx) => {
      const head = run[0];
      return {
        id: head?.id ?? `${kind}-${idx}`,
        kind,
        startedAt: head ? new Date(head.createdAt).getTime() : 0,
        entries: run,
      };
    });
  }, [data, kind]);
}

/**
 * Legacy wrapper: renders every run of one (applicationId, kind)
 * pair. Kept for callers that don't do chronological merging. New
 * code should use `useOperationRuns` + `OperationRunCard` directly.
 */
export function OperationBubble({ applicationId, kind }: OperationBubbleProps) {
  const runs = useOperationRuns(applicationId, kind);
  if (runs.length === 0) return null;
  return (
    <>
      {runs.map((run, idx) => (
        <OperationRunCard
          key={run.id}
          applicationId={applicationId}
          kind={kind}
          entries={run.entries}
          runIndex={idx}
        />
      ))}
    </>
  );
}

export function OperationRunCard({
  applicationId,
  kind,
  entries,
  runIndex,
}: {
  applicationId: string;
  kind: OperationBubbleProps['kind'];
  entries: OperationLogEntryDto[];
  runIndex: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const status = deriveStatus(entries);
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const isInFlight = status === 'in-progress';

  // Always collapsed by default — even while in-flight. The header
  // row still shows a spinning chip + live title so the user knows
  // work is happening; clicking the chevron reveals the full log.
  // Auto-expanding on every run created wall-of-text chaos once the
  // timeline started interleaving multiple operation kinds.
  const contentId = `op-${kind}-${applicationId}-${runIndex}`;

  return (
    <div
      // `shrink-0` — direct child of the Thread viewport flex-col,
      // must not be squashed when a sibling card expands.
      className={cn('mx-3 shrink-0 overflow-hidden', 'animate-in fade-in-0 duration-150 ease-out')}
      data-testid={`operation-bubble-${kind}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className={cn(
          // One-liner row: tight vertical rhythm, no borders, no
          // card chrome — just icon · title · meta · status · chevron.
          'group flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors',
          'hover:bg-muted/40'
        )}
      >
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center',
            isInFlight ? meta.liveText : 'text-muted-foreground'
          )}
        >
          {isInFlight ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}
        </span>
        <span
          className={cn(
            'truncate text-[11px] font-medium',
            isInFlight ? meta.liveText : 'text-foreground/90'
          )}
        >
          {isInFlight ? meta.inProgressTitle : meta.title}
        </span>
        <span className="text-muted-foreground shrink-0 text-[10px]">
          · {entries.length} event{entries.length === 1 ? '' : 's'} ·{' '}
          {formatTime(entries[0].createdAt)}
        </span>
        <span className="flex-1" />
        <StatusBadge status={status} />
        <ChevronDown
          className={cn(
            'text-muted-foreground h-3 w-3 shrink-0 transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {/* Expanded body: full list of log entries. Constrained to a
          max-height with internal scroll so a long deploy log
          can't blow out the chat pane's vertical space. */}
      {expanded ? (
        <div id={contentId} className="border-border/40 bg-background/30 mt-1 rounded-md border">
          <ol className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto px-3 py-2.5">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <span className="text-muted-foreground/80 shrink-0 font-mono text-[10px]">
                  {formatTime(e.createdAt)}
                </span>
                <LevelDot level={e.level} />
                <span className="text-foreground/90 min-w-0 flex-1 break-words whitespace-pre-wrap">
                  {e.message}
                  {e.detail ? (
                    <span className="text-muted-foreground/70 mt-0.5 block font-mono text-[10px] whitespace-pre-wrap">
                      {e.detail}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: BubbleStatus }) {
  if (status === 'in-progress') {
    // The header chip spinner already communicates live state.
    // Hide this badge to avoid a double spinner in the header row.
    return null;
  }
  if (status === 'success') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-emerald-500">
        <CheckCircle2 className="h-3 w-3" /> done
      </span>
    );
  }
  if (status === 'warn') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-amber-500">
        <AlertTriangle className="h-3 w-3" /> warnings
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-rose-500">
        <XCircle className="h-3 w-3" /> failed
      </span>
    );
  }
  return null;
}

function LevelDot({ level }: { level: string }) {
  const color =
    level === 'Error'
      ? 'bg-rose-500'
      : level === 'Warn'
        ? 'bg-amber-500'
        : level === 'Debug'
          ? 'bg-muted-foreground/50'
          : 'bg-emerald-500';
  return <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', color)} />;
}
