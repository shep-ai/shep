'use client';

/**
 * OperationBubble
 *
 * Static, chronological info card rendered in the chat thread for a
 * completed long-running operation on the application — currently
 * either "Publish to GitHub" (GitRemoteCreate) or "Deploy to cloud"
 * (CloudDeploy).
 *
 * Source of truth: the existing `/api/operations/:kind/:id/logs`
 * endpoint which is backed by the `operation_log_entries` table.
 * This component is a THIN presentation layer — it polls the logs
 * while the operation is still writing entries and renders them in
 * order. No grouping or summarization logic lives here; any derived
 * state (e.g. "success" vs "failed") is computed from the last log
 * level of the raw entries returned by the server.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Github, Rocket, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
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
  kind: 'publish' | 'deploy';
}

const KIND_TO_OP: Record<OperationBubbleProps['kind'], string> = {
  publish: OperationLogKind.GitRemoteCreate,
  deploy: OperationLogKind.CloudDeploy,
};

const KIND_META = {
  publish: {
    title: 'Published to GitHub',
    inProgressTitle: 'Publishing to GitHub…',
    icon: Github,
    accent: 'text-sky-500 bg-sky-500/15',
  },
  deploy: {
    title: 'Deployed to cloud',
    inProgressTitle: 'Deploying to cloud…',
    icon: Rocket,
    accent: 'text-fuchsia-500 bg-fuchsia-500/15',
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

/**
 * Derive a human status from the raw entries. An operation is
 * "in-progress" while entries are still being appended (we can't
 * tell from logs alone so we treat the last 10 seconds of activity
 * as live). Otherwise "success" if the last entry is Info/Debug,
 * "failed" if the last entry is Error, "warn" if Warn.
 */
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

export function OperationBubble({ applicationId, kind }: OperationBubbleProps) {
  const { data } = useQuery({
    queryKey: ['operation-logs', applicationId, kind] as const,
    queryFn: () => fetchLogs(applicationId, kind),
    refetchInterval: (q) => {
      // While still live, poll fast so new entries appear as they
      // land. Once the operation has settled the auto-refresh
      // relaxes — a mount is enough to hydrate the final state.
      const entries = q.state.data?.entries ?? [];
      if (entries.length === 0) return false;
      const status = deriveStatus(entries);
      return status === 'in-progress' ? 1500 : false;
    },
    staleTime: 0,
  });

  const entries = useMemo(() => data?.entries ?? [], [data]);
  if (entries.length === 0) return null;

  const status = deriveStatus(entries);
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const isInFlight = status === 'in-progress';

  return (
    <div
      className={cn(
        'border-border/60 bg-card/50 mx-3 my-2 overflow-hidden rounded-lg border shadow-sm',
        'animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out'
      )}
      data-testid={`operation-bubble-${kind}`}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            meta.accent
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate text-[12px] font-semibold">
            {isInFlight ? meta.inProgressTitle : meta.title}
          </div>
          <div className="text-muted-foreground text-[10px]">
            {entries.length} event{entries.length === 1 ? '' : 's'} · started{' '}
            {formatTime(entries[0].createdAt)}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>
      <ol className="border-border/60 bg-background/40 flex flex-col gap-1 border-t px-3 py-2">
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
  );
}

function StatusBadge({ status }: { status: BubbleStatus }) {
  if (status === 'in-progress') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-sky-500">
        <Loader2 className="h-3 w-3 animate-spin" /> in progress
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
        <CheckCircle2 className="h-3 w-3" /> done
      </span>
    );
  }
  if (status === 'warn') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-500">
        <AlertTriangle className="h-3 w-3" /> warnings
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-rose-500">
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
