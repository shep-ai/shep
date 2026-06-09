/**
 * RiskScoreBreakdown — renders the per-dimension contributions of a
 * composite RiskScore (feature 098, phase 5, task-30).
 *
 * Presentation only. Pass in a `RiskScoreBreakdown` value object from the
 * server (the finding-detail page resolves it from the risk_scores table)
 * and the component renders the total + a bar chart of contributions.
 *
 * Loading and error states are first-class — the parent passes
 * `loading` / `error` to avoid coupling the component to data fetching.
 */

'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';
import type { RiskScoreBreakdown as Breakdown } from '@shepai/core/domain/generated/output';

export interface RiskScoreBreakdownProps {
  breakdown?: Breakdown | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
  /**
   * When provided, the empty state renders a "Compute now" button that
   * invokes this handler. The handler is expected to trigger an
   * on-demand recompute and refresh the parent's data. Omit it in
   * read-only contexts (stories, snapshots) — the empty state will
   * fall back to a static message.
   */
  onCompute?: () => Promise<void>;
}

interface Row {
  key: keyof Omit<Breakdown, 'total'>;
  label: string;
  hint: string;
}

const ROWS: readonly Row[] = [
  { key: 'cvssContribution', label: 'CVSS', hint: 'Base technical severity' },
  { key: 'epssContribution', label: 'EPSS', hint: 'Exploitability percentile' },
  { key: 'kevContribution', label: 'KEV', hint: 'CISA Known Exploited Vulnerabilities' },
  { key: 'exposureContribution', label: 'Exposure', hint: 'Asset network exposure' },
  { key: 'criticalityContribution', label: 'Criticality', hint: 'Business criticality tier' },
  { key: 'dataClassificationContribution', label: 'Data class', hint: 'Data classification' },
] as const;

const MAX_CONTRIBUTION: Record<Row['key'], number> = {
  cvssContribution: 35,
  epssContribution: 15,
  kevContribution: 20,
  exposureContribution: 15,
  criticalityContribution: 10,
  dataClassificationContribution: 5,
};

export function RiskScoreBreakdown({
  breakdown,
  loading,
  error,
  className,
  onCompute,
}: RiskScoreBreakdownProps) {
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);

  if (loading === true) {
    return (
      <div
        data-testid="risk-score-breakdown-loading"
        className={cn('flex h-24 items-center justify-center rounded-md border', className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-sm">Computing risk score…</span>
      </div>
    );
  }

  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <div
        data-testid="risk-score-breakdown-error"
        className={cn(
          'flex h-24 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
          className
        )}
        role="alert"
      >
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }

  if (breakdown === null || breakdown === undefined) {
    const handleCompute = onCompute
      ? async () => {
          if (computing) return;
          setComputing(true);
          setComputeError(null);
          try {
            await onCompute();
          } catch (err) {
            setComputeError(err instanceof Error ? err.message : String(err));
          } finally {
            setComputing(false);
          }
        }
      : undefined;

    return (
      <div
        data-testid="risk-score-breakdown-empty"
        className={cn(
          'flex h-24 flex-col items-center justify-center gap-2 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">No risk score yet</span>
        {handleCompute ? (
          <>
            <button
              type="button"
              data-testid="risk-score-compute-now"
              onClick={() => {
                void handleCompute();
              }}
              disabled={computing}
              aria-busy={computing}
              className="hover:bg-accent rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-60"
            >
              {computing ? 'Computing…' : 'Compute now'}
            </button>
            {computeError !== null ? (
              <span
                data-testid="risk-score-compute-error"
                className="text-xs text-red-600 dark:text-red-400"
                role="alert"
              >
                {computeError}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  const total = breakdown.total;
  return (
    <div
      data-testid="risk-score-breakdown"
      className={cn('rounded-md border p-4', className)}
      role="region"
      aria-label="Risk score breakdown"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground text-xs tracking-wide uppercase">Risk score</span>
        <span
          data-testid="risk-score-total"
          className="text-3xl font-semibold tabular-nums"
          aria-label={`Total risk score: ${total} of 100`}
        >
          {total}
          <span className="text-muted-foreground ml-1 text-base font-normal">/100</span>
        </span>
      </div>
      <ul className="space-y-2">
        {ROWS.map((row) => (
          <BreakdownRow
            key={row.key}
            label={row.label}
            hint={row.hint}
            value={breakdown[row.key]}
            max={MAX_CONTRIBUTION[row.key]}
          />
        ))}
      </ul>
    </div>
  );
}

interface BreakdownRowProps {
  label: string;
  hint: string;
  value: number;
  max: number;
}

function BreakdownRow({ label, hint, value, max }: BreakdownRowProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const empty = value === 0;
  return (
    <li
      data-testid={`risk-score-row-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className="flex items-center gap-3 text-xs"
    >
      <div className="w-24 shrink-0">
        <span className="font-medium">{label}</span>
      </div>
      <div className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-all',
            empty ? 'bg-muted-foreground/20' : 'bg-primary'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right">
        <span className="font-medium tabular-nums">{value.toFixed(2)}</span>
        <span className="text-muted-foreground ml-1">/ {max}</span>
      </div>
      <span className="text-muted-foreground hidden w-32 shrink-0 text-[10px] sm:inline">
        {hint}
      </span>
    </li>
  );
}
