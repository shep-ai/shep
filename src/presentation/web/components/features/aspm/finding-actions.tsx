/**
 * FindingActions — client island under /aspm/findings/[id]
 *
 * Surfaces the three triage actions the spec requires on the finding
 * detail page (feature 098, phase 7, task-44):
 *
 *   - Declare exception   → POST /api/aspm/findings/[id]/exceptions
 *   - Revoke exception    → DELETE /api/aspm/findings/[id]/exceptions
 *   - Convert to work-item → POST /api/aspm/findings/[id]/work-item
 *
 * Presentation only — the HTTP endpoints are added in phase 10's CLI/web
 * wiring sweep. The component renders the controls and reports the result
 * via the supplied callbacks so the parent (and Storybook) drive
 * behavior in tests.
 */

'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

export interface FindingActionsProps {
  findingId: string;
  workItemId: string | null;
  /**
   * Optional override — when provided, replaces the default `fetch` call
   * to the exception/work-item endpoints. Used by stories + RTL tests so
   * the component can be exercised without real HTTP.
   */
  actions?: {
    declareException?: (input: {
      findingId: string;
      reason: string;
      justification: string;
      expiresInDays: number;
    }) => Promise<void>;
    revokeException?: (findingId: string) => Promise<void>;
    convertToWorkItem?: (findingId: string) => Promise<{ workItemId: string }>;
  };
  className?: string;
}

const DEFAULT_REASON = 'AcceptedRisk';

export function FindingActions({ findingId, workItemId, actions, className }: FindingActionsProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [linkedWorkItem, setLinkedWorkItem] = useState<string | null>(workItemId);

  async function withBusy(label: string, fn: () => Promise<void>): Promise<void> {
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

  async function onDeclare() {
    await withBusy('Declaring exception', async () => {
      const impl =
        actions?.declareException ??
        (async (i) => {
          await postJson(`/api/aspm/findings/${i.findingId}/exceptions`, i);
        });
      await impl({
        findingId,
        reason: DEFAULT_REASON,
        justification: 'Triaged from /aspm/findings/[id]',
        expiresInDays: 30,
      });
    });
  }

  async function onRevoke() {
    await withBusy('Revoking exception', async () => {
      const impl =
        actions?.revokeException ??
        (async (id) => {
          await deleteJson(`/api/aspm/findings/${id}/exceptions`);
        });
      await impl(findingId);
    });
  }

  async function onConvert() {
    await withBusy('Routing to backlog', async () => {
      const impl =
        actions?.convertToWorkItem ??
        (async (id) => {
          return (await postJson(`/api/aspm/findings/${id}/work-item`, {})) as {
            workItemId: string;
          };
        });
      const { workItemId: newId } = await impl(findingId);
      setLinkedWorkItem(newId);
    });
  }

  return (
    <div
      data-testid="finding-actions"
      className={cn('bg-card flex flex-wrap items-center gap-2 rounded-md border p-3', className)}
      role="region"
      aria-label="Finding actions"
    >
      <button
        type="button"
        data-testid="finding-action-declare-exception"
        disabled={busy}
        onClick={onDeclare}
        className="rounded-md border bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-950 dark:text-amber-100"
      >
        Declare exception
      </button>
      <button
        type="button"
        data-testid="finding-action-revoke-exception"
        disabled={busy}
        onClick={onRevoke}
        className="hover:bg-accent rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
      >
        Revoke exception
      </button>
      <button
        type="button"
        data-testid="finding-action-convert-to-work-item"
        disabled={busy || linkedWorkItem !== null}
        onClick={onConvert}
        className="rounded-md border bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:bg-sky-950 dark:text-sky-100"
      >
        {linkedWorkItem === null
          ? 'Route to engineering backlog'
          : `Linked to WorkItem ${linkedWorkItem.slice(0, 8)}…`}
      </button>
      {status !== null ? (
        <span data-testid="finding-actions-status" className="text-muted-foreground text-xs">
          {status}
        </span>
      ) : null}
    </div>
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

async function deleteJson(url: string): Promise<unknown> {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    return null;
  }
}
