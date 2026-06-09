/**
 * PostureCards — KPI tile grid for the /aspm dashboard
 * (feature 098, phase 7, task-43 / FR-24).
 *
 * Presentation only — the parent server component (or the SSE
 * subscription) supplies the `PostureSummary` payload. The component
 * itself does not branch on domain logic, just renders each KPI.
 *
 * Accessibility: every tile is a labeled region with a screen-reader
 * accessible name; numeric values use `aria-live="polite"` so SSE
 * updates announce without yelling.
 */

'use client';

import { cn } from '@/lib/utils';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';
import { AspmScanDialog } from '@/components/features/aspm/aspm-scan-dialog/aspm-scan-dialog';

export interface PostureSummaryView {
  openBySeverity: { severity: CanonicalSeverity; count: number }[];
  topAtRiskApplications: {
    applicationId: string;
    openFindingCount: number;
    riskScoreSum: number;
  }[];
  kevOpenCount: number;
  slaBreachCount: number;
  exceptionCount: number;
  aiReviewQueueDepth: number;
  lastIngestedAt: string | null;
}

export interface PostureCardsProps {
  summary?: PostureSummaryView | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

const SEVERITY_ORDER: CanonicalSeverity[] = [
  CanonicalSeverity.Critical,
  CanonicalSeverity.High,
  CanonicalSeverity.Medium,
  CanonicalSeverity.Low,
  CanonicalSeverity.Info,
];

const SEVERITY_TILE_STYLES: Record<CanonicalSeverity, string> = {
  [CanonicalSeverity.Critical]: 'border-red-300 text-red-900 dark:border-red-900 dark:text-red-100',
  [CanonicalSeverity.High]:
    'border-orange-300 text-orange-900 dark:border-orange-900 dark:text-orange-100',
  [CanonicalSeverity.Medium]:
    'border-amber-300 text-amber-900 dark:border-amber-900 dark:text-amber-100',
  [CanonicalSeverity.Low]: 'border-sky-300 text-sky-900 dark:border-sky-900 dark:text-sky-100',
  [CanonicalSeverity.Info]:
    'border-neutral-300 text-neutral-900 dark:border-neutral-700 dark:text-neutral-100',
};

export function PostureCards({ summary, loading, error, className }: PostureCardsProps) {
  if (loading) {
    return (
      <div
        data-testid="posture-cards-loading"
        className={cn('flex h-32 items-center justify-center rounded-md border', className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-sm">Loading posture…</span>
      </div>
    );
  }
  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <div
        data-testid="posture-cards-error"
        role="alert"
        className={cn(
          'flex h-32 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
          className
        )}
      >
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }
  if (!summary) {
    return (
      <div
        data-testid="posture-cards-empty"
        className={cn(
          'flex h-32 flex-col items-center justify-center gap-2 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">No posture data yet</span>
        <span className="text-muted-foreground text-xs">
          Upload a SARIF or SBOM document to populate the dashboard
        </span>
        <AspmScanDialog />
      </div>
    );
  }

  const severityByKey = new Map(summary.openBySeverity.map((c) => [c.severity, c.count]));

  return (
    <div
      data-testid="posture-cards"
      className={cn('grid grid-cols-2 gap-3 md:grid-cols-5', className)}
    >
      {SEVERITY_ORDER.map((severity) => (
        <SeverityTile key={severity} severity={severity} count={severityByKey.get(severity) ?? 0} />
      ))}
      <KpiTile
        testId="kpi-tile-kev"
        label="KEV-listed open"
        value={summary.kevOpenCount}
        hint="CVEs in CISA's Known Exploited Vulnerabilities catalog"
      />
      <KpiTile
        testId="kpi-tile-sla-breach"
        label="SLA breached"
        value={summary.slaBreachCount}
        hint="Findings past their policy window"
      />
      <KpiTile
        testId="kpi-tile-exceptions"
        label="Active exceptions"
        value={summary.exceptionCount}
        hint="Self-declared risk exceptions still in force"
      />
      <KpiTile
        testId="kpi-tile-ai-review"
        label="AI review queue"
        value={summary.aiReviewQueueDepth}
        hint="Open AI-change risk signals"
      />
      <LastIngestedTile lastIngestedAt={summary.lastIngestedAt} />
    </div>
  );
}

interface SeverityTileProps {
  severity: CanonicalSeverity;
  count: number;
}

function SeverityTile({ severity, count }: SeverityTileProps) {
  return (
    <div
      data-testid={`posture-tile-${severity.toLowerCase()}`}
      role="region"
      aria-label={`Open ${severity} findings`}
      className={cn(
        'bg-card flex flex-col gap-1 rounded-md border p-3',
        SEVERITY_TILE_STYLES[severity]
      )}
    >
      <span className="text-[11px] font-semibold tracking-wide uppercase">{severity}</span>
      <span className="text-2xl font-semibold tabular-nums" aria-live="polite">
        {count}
      </span>
      <span className="text-muted-foreground text-[11px]">open</span>
    </div>
  );
}

interface KpiTileProps {
  testId: string;
  label: string;
  value: number;
  hint?: string;
}

function KpiTile({ testId, label, value, hint }: KpiTileProps) {
  return (
    <div
      data-testid={testId}
      role="region"
      aria-label={label}
      className="bg-card flex flex-col gap-1 rounded-md border p-3"
    >
      <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      {hint !== undefined ? (
        <span className="text-muted-foreground text-[11px]">{hint}</span>
      ) : null}
    </div>
  );
}

function LastIngestedTile({ lastIngestedAt }: { lastIngestedAt: string | null }) {
  const label = lastIngestedAt === null ? 'Never' : formatIso(lastIngestedAt);
  return (
    <div
      data-testid="kpi-tile-last-ingested"
      role="region"
      aria-label="Last scanned"
      className="bg-card flex flex-col gap-1 rounded-md border p-3"
    >
      <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        Last scanned
      </span>
      <span className="text-sm font-medium tabular-nums" aria-live="polite">
        {label}
      </span>
      <span className="text-muted-foreground text-[11px]">Most recent scanner observation</span>
    </div>
  );
}

function formatIso(iso: string): string {
  try {
    const d = new Date(iso);
    return d
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, 'Z');
  } catch {
    return iso;
  }
}
