/**
 * AiReviewQueue — client island under /aspm/ai-review
 *
 * Feature 098, phase 8 (task-51). Renders the open + acknowledged
 * AiChangeRiskSignal queue with one-row-per-signal triage controls:
 *
 *   - Graduate to SecurityFinding → POST /api/aspm/ai-review/[id]/graduate
 *   - Dismiss with justification   → POST /api/aspm/ai-review/[id]/dismiss
 *
 * Presentation only — the HTTP endpoints land in phase 10. The component
 * exercises the same action-callback pattern as `finding-actions.tsx` so
 * stories and RTL tests can inject fakes.
 */

'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';
import { SeverityBadge } from './severity-badge';
import type { AiChangeRiskSignal } from '@shepai/core/domain/generated/output';
import { AiSignalState } from '@shepai/core/domain/generated/output';

export interface AiReviewQueueActions {
  graduateSignal?: (signalId: string) => Promise<{ findingId: string }>;
  dismissSignal?: (input: { signalId: string; justification: string }) => Promise<void>;
}

export interface AiReviewQueueProps {
  signals: AiChangeRiskSignal[];
  loading?: boolean;
  error?: string | null;
  actions?: AiReviewQueueActions;
  className?: string;
}

const STATE_BADGE: Record<AiSignalState, string> = {
  [AiSignalState.Open]: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  [AiSignalState.Acknowledged]: 'bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100',
  [AiSignalState.GraduatedToFinding]:
    'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
  [AiSignalState.Dismissed]: 'bg-muted text-muted-foreground',
  [AiSignalState.Resolved]: 'bg-muted text-muted-foreground',
};

export function AiReviewQueue({ signals, loading, error, actions, className }: AiReviewQueueProps) {
  if (loading === true) {
    return (
      <div
        data-testid="ai-review-queue-loading"
        className={cn('flex h-32 items-center justify-center rounded-md border', className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-sm">Loading AI signals…</span>
      </div>
    );
  }

  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <div
        data-testid="ai-review-queue-error"
        className={cn(
          'flex h-32 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
          className
        )}
        role="alert"
      >
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div
        data-testid="ai-review-queue-empty"
        className={cn(
          'flex h-32 flex-col items-center justify-center gap-1 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">AI review queue is clear</span>
        <span className="text-muted-foreground text-xs">
          Shep records signals here whenever an agent introduces risk in a diff.
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn('overflow-x-auto rounded-md border', className)}
      role="region"
      aria-label="AI change review queue"
    >
      <table data-testid="ai-review-queue" className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-[11px] tracking-wide uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Severity
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Signal
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Type
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              State
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Discovered
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => (
            <AiReviewQueueRow key={signal.id} signal={signal} actions={actions} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  signal: AiChangeRiskSignal;
  actions?: AiReviewQueueActions;
}

function AiReviewQueueRow({ signal, actions }: RowProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [state, setState] = useState<AiSignalState>(signal.state);

  const terminal =
    state === AiSignalState.GraduatedToFinding ||
    state === AiSignalState.Dismissed ||
    state === AiSignalState.Resolved;

  async function withBusy(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setStatus(`${label}…`);
    try {
      await fn();
      setStatus(`${label} ✓`);
    } catch (err) {
      setStatus(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onGraduate() {
    await withBusy('Graduating to finding', async () => {
      const impl =
        actions?.graduateSignal ??
        (async (id) => {
          return (await postJson(`/api/aspm/ai-review/${id}/graduate`, {})) as {
            findingId: string;
          };
        });
      await impl(signal.id);
      setState(AiSignalState.GraduatedToFinding);
    });
  }

  async function onDismiss() {
    await withBusy('Dismissing signal', async () => {
      const impl =
        actions?.dismissSignal ??
        (async (input) => {
          await postJson(`/api/aspm/ai-review/${input.signalId}/dismiss`, {
            justification: input.justification,
          });
        });
      await impl({ signalId: signal.id, justification: 'Dismissed from /aspm/ai-review' });
      setState(AiSignalState.Dismissed);
    });
  }

  const discovered =
    signal.discoveredAt instanceof Date
      ? signal.discoveredAt.toISOString().slice(0, 10)
      : String(signal.discoveredAt).slice(0, 10);

  return (
    <tr data-testid={`ai-review-queue-row-${signal.id}`} className="border-t align-top">
      <td className="px-3 py-2">
        <SeverityBadge severity={signal.severity} />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col">
          <span className="font-medium">{signal.summary}</span>
          {signal.agentSessionId !== undefined ? (
            <span className="text-muted-foreground text-[11px]">
              Session {signal.agentSessionId}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2 text-xs">{signal.signalType}</td>
      <td className="px-3 py-2">
        <span
          data-testid={`ai-review-queue-state-${signal.id}`}
          className={cn(
            'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium',
            STATE_BADGE[state]
          )}
        >
          {state}
        </span>
      </td>
      <td className="text-muted-foreground px-3 py-2 font-mono text-[11px]">{discovered}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid={`ai-review-action-graduate-${signal.id}`}
            disabled={busy || terminal}
            onClick={onGraduate}
            className="rounded-md border bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950 dark:text-emerald-100"
          >
            Graduate
          </button>
          <button
            type="button"
            data-testid={`ai-review-action-dismiss-${signal.id}`}
            disabled={busy || terminal}
            onClick={onDismiss}
            className="hover:bg-accent rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-50"
          >
            Dismiss
          </button>
          {status !== null ? (
            <span
              data-testid={`ai-review-status-${signal.id}`}
              className="text-muted-foreground text-[11px]"
            >
              {status}
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    return null;
  }
}
