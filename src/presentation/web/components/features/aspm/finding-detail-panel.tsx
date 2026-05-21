/**
 * FindingDetailPanel — single-finding view (feature 098, phase 5, task-30).
 *
 * Presentation only. Renders the finding's identity (title, severity,
 * source, location), descriptive context (description, CVE/CWE/ASVS
 * references), and the composite RiskScore breakdown via
 * {@link RiskScoreBreakdown}.
 *
 * Data fetched by the parent route (server component) and passed in as
 * props. Loading / error / not-found states are first-class so the panel
 * works in dashboards, drawers, and Storybook without coupling to
 * specific data sources.
 */

'use client';

import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { RiskScoreBreakdown } from './risk-score-breakdown';
import { SeverityBadge } from './severity-badge';
import type {
  RiskScoreBreakdown as Breakdown,
  SecurityFinding,
} from '@shepai/core/domain/generated/output';

export interface FindingDetailPanelProps {
  finding?: SecurityFinding | null;
  riskScoreBreakdown?: Breakdown | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
  /**
   * Optional override for the "Compute now" handler in the
   * RiskScoreBreakdown empty state. When omitted, the panel uses the
   * default {@link defaultComputeRiskScore} that POSTs to
   * `/api/aspm/findings/[id]/risk-score` and triggers a router refresh.
   * Storybook stories and RTL tests pass an override to exercise the
   * UI without real HTTP.
   */
  onComputeRiskScore?: (findingId: string) => Promise<void>;
}

export function FindingDetailPanel({
  finding,
  riskScoreBreakdown,
  loading,
  error,
  className,
  onComputeRiskScore,
}: FindingDetailPanelProps) {
  const router = useRouter();

  if (loading === true) {
    return (
      <div
        data-testid="finding-detail-loading"
        className={cn('flex h-64 items-center justify-center rounded-md border', className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-sm">Loading finding…</span>
      </div>
    );
  }

  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <div
        data-testid="finding-detail-error"
        className={cn(
          'flex h-64 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
          className
        )}
        role="alert"
      >
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }

  if (finding === null || finding === undefined) {
    return (
      <div
        data-testid="finding-detail-empty"
        className={cn(
          'flex h-64 flex-col items-center justify-center gap-1 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">No finding selected</span>
        <span className="text-muted-foreground text-xs">
          Pick a row from the findings list to see its details
        </span>
      </div>
    );
  }

  const location =
    finding.locationPath !== undefined
      ? finding.locationLine !== undefined
        ? `${finding.locationPath}:${finding.locationLine}`
        : finding.locationPath
      : undefined;

  return (
    <article
      data-testid="finding-detail-panel"
      className={cn('flex flex-col gap-4 rounded-md border p-5', className)}
      aria-label={`Finding: ${finding.title}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg leading-tight font-semibold">{finding.title}</h2>
          <code className="text-muted-foreground text-[11px]">{finding.ruleId}</code>
        </div>
        <SeverityBadge severity={finding.canonicalSeverity} />
      </header>

      <section
        data-testid="finding-detail-metadata"
        className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2"
      >
        <MetaRow label="Domain" value={finding.findingDomain} />
        <MetaRow label="State" value={finding.state} />
        <MetaRow label="Source" value={finding.source} />
        <MetaRow label="Raw severity" value={finding.rawSeverity} mono />
        {location !== undefined && <MetaRow label="Location" value={location} mono />}
        {finding.cveId !== undefined && finding.cveId.length > 0 && (
          <MetaRow label="CVE" value={finding.cveId} mono />
        )}
        {finding.cweId !== undefined && finding.cweId.length > 0 && (
          <MetaRow label="CWE" value={finding.cweId} mono />
        )}
        {finding.owaspAsvsControlId !== undefined && finding.owaspAsvsControlId.length > 0 && (
          <MetaRow label="OWASP ASVS" value={finding.owaspAsvsControlId} mono />
        )}
        {finding.kev === true && <MetaRow label="KEV" value="Listed (CISA)" />}
        {finding.epssPercentile !== undefined && (
          <MetaRow label="EPSS" value={`${(finding.epssPercentile * 100).toFixed(1)} percentile`} />
        )}
      </section>

      <section data-testid="finding-detail-description">
        <h3 className="text-muted-foreground mb-1 text-[11px] tracking-wide uppercase">
          Description
        </h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{finding.description}</p>
      </section>

      <section data-testid="finding-detail-risk">
        <RiskScoreBreakdown
          breakdown={riskScoreBreakdown ?? null}
          onCompute={async () => {
            const compute = onComputeRiskScore ?? defaultComputeRiskScore;
            await compute(finding.id);
            router.refresh();
          }}
        />
      </section>
    </article>
  );
}

interface MetaRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function MetaRow({ label, value, mono }: MetaRowProps) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-[10px] tracking-wide uppercase">{label}</span>
      <span className={cn('text-foreground', mono === true ? 'font-mono text-[11px]' : 'text-xs')}>
        {value}
      </span>
    </div>
  );
}

async function defaultComputeRiskScore(findingId: string): Promise<void> {
  const res = await fetch(`/api/aspm/findings/${findingId}/risk-score`, { method: 'POST' });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === 'string' && body.error.length > 0) message = body.error;
    } catch {
      // ignore parse failures — fall back to status code
    }
    throw new Error(message);
  }
}
