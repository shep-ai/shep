/**
 * AspmApplicationSection — drop-in panel for the Application detail view
 * (feature 098, phase 7, task-46 / FR-38).
 *
 * Renders a compact ASPM snapshot for one Application:
 *   - top risk score badge (from the highest-ranked finding)
 *   - per-severity open counts
 *   - active exception count
 *   - top 5 findings table
 *
 * Presentation only — the parent (the existing Application detail page)
 * fetches the data via `GetApplicationPostureUseCase` and passes the
 * shaped payload in as a prop. Empty state is first-class so the
 * section renders gracefully on Applications without ASPM data.
 */

'use client';

import { cn } from '@/lib/utils';
import { type CanonicalSeverity, type SecurityFinding } from '@shepai/core/domain/generated/output';

import { FindingsTable } from './findings-table';
import { SeverityBadge } from './severity-badge';
import { AspmScanDialog } from './aspm-scan-dialog/aspm-scan-dialog';

export interface AspmApplicationSectionProps {
  applicationId: string;
  posture: AspmApplicationSectionView | null;
  loading?: boolean;
  error?: string | null;
  exceptionCount?: number;
  className?: string;
}

export interface AspmApplicationSectionView {
  openBySeverity: { severity: CanonicalSeverity; count: number }[];
  topFindings: SecurityFinding[];
  topRiskScoreTotal: number | null;
  ownerCount: number;
}

export function AspmApplicationSection({
  applicationId,
  posture,
  loading,
  error,
  exceptionCount = 0,
  className,
}: AspmApplicationSectionProps) {
  if (loading) {
    return (
      <section
        data-testid={`aspm-app-section-loading-${applicationId}`}
        className={cn('flex h-40 items-center justify-center rounded-md border', className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-sm">Loading ASPM posture…</span>
      </section>
    );
  }

  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <section
        data-testid={`aspm-app-section-error-${applicationId}`}
        role="alert"
        className={cn(
          'flex h-32 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
          className
        )}
      >
        <span className="text-sm font-medium">{error}</span>
      </section>
    );
  }

  if (posture === null) {
    return (
      <section
        data-testid={`aspm-app-section-empty-${applicationId}`}
        className={cn(
          'flex h-32 flex-col items-center justify-center gap-2 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">No ASPM data for this application</span>
        <span className="text-muted-foreground text-xs">
          Upload a SARIF or SBOM document to populate posture.
        </span>
        <AspmScanDialog defaultApplicationId={applicationId} />
      </section>
    );
  }

  const total = posture.openBySeverity.reduce((sum, c) => sum + c.count, 0);

  return (
    <section
      data-testid={`aspm-app-section-${applicationId}`}
      aria-labelledby={`aspm-section-heading-${applicationId}`}
      className={cn('bg-card flex flex-col gap-3 rounded-md border p-3', className)}
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <h3
          id={`aspm-section-heading-${applicationId}`}
          className="text-sm font-semibold tracking-wide uppercase"
        >
          ASPM
        </h3>
        <span className="text-muted-foreground text-xs">
          {total} open · {exceptionCount} active exception{exceptionCount === 1 ? '' : 's'}
        </span>
        {posture.topRiskScoreTotal !== null ? (
          <span
            data-testid="aspm-app-section-top-score"
            className="ml-auto rounded-md border bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          >
            top risk {posture.topRiskScoreTotal}
          </span>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {posture.openBySeverity.map((c) => (
          <span key={c.severity} className="flex items-center gap-1.5 text-[11px]">
            <SeverityBadge severity={c.severity} />
            <span className="font-medium tabular-nums">{c.count}</span>
          </span>
        ))}
      </div>

      <FindingsTable findings={posture.topFindings} />
    </section>
  );
}
