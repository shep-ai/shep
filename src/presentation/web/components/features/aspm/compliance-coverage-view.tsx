/**
 * ComplianceCoverageView — per-framework coverage matrix for the
 * `/aspm/compliance` page (feature 098, phase 9 / task-54, FR-35).
 *
 * Presentation only — the parent page resolves
 * `GetComplianceCoverageUseCase` and feeds the result in.
 *
 * Accessibility: every framework section is a labeled region; rows are a
 * semantic <table> with a caption. Counts use `tabular-nums` so the
 * column stays aligned and `aria-live="polite"` so SSE-driven re-renders
 * don't shout.
 */

'use client';

import { ComplianceFramework } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';

export interface FrameworkCoverageView {
  frameworkId: ComplianceFramework;
  totalControls: number;
  controlsWithOpenFindings: number;
  controlsWithoutEvidence: number;
  totalOpenFindingLinks: number;
  controls: {
    controlId: string;
    controlIdentifier: string;
    title: string;
    openFindingCount: number;
  }[];
}

export interface ComplianceCoverageViewProps {
  frameworks?: FrameworkCoverageView[] | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

const FRAMEWORK_LABELS: Record<ComplianceFramework, string> = {
  [ComplianceFramework.OwaspAsvs]: 'OWASP ASVS',
  [ComplianceFramework.CweTop25]: 'CWE Top 25',
};

const FRAMEWORK_DESCRIPTIONS: Record<ComplianceFramework, string> = {
  [ComplianceFramework.OwaspAsvs]:
    'OWASP Application Security Verification Standard — code-level controls populated from SARIF taxa references.',
  [ComplianceFramework.CweTop25]:
    'CWE Top 25 most dangerous software weaknesses — populated from scanner CWE taxa or rule properties.',
};

export function ComplianceCoverageView({
  frameworks,
  loading,
  error,
  className,
}: ComplianceCoverageViewProps) {
  if (loading === true) {
    return (
      <div
        data-testid="compliance-coverage-loading"
        className={cn('flex h-40 items-center justify-center rounded-md border', className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-sm">Loading compliance coverage…</span>
      </div>
    );
  }

  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <div
        data-testid="compliance-coverage-error"
        role="alert"
        className={cn(
          'flex h-40 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
          className
        )}
      >
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }

  if (!frameworks || frameworks.length === 0) {
    return (
      <div
        data-testid="compliance-coverage-empty"
        className={cn(
          'flex h-40 flex-col items-center justify-center gap-1 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">No compliance frameworks configured</span>
        <span className="text-muted-foreground text-xs">
          Run database migrations to seed OWASP ASVS + CWE Top 25 controls.
        </span>
      </div>
    );
  }

  return (
    <div data-testid="compliance-coverage-view" className={cn('flex flex-col gap-6', className)}>
      {frameworks.map((framework) => (
        <FrameworkSection key={framework.frameworkId} framework={framework} />
      ))}
    </div>
  );
}

interface FrameworkSectionProps {
  framework: FrameworkCoverageView;
}

function FrameworkSection({ framework }: FrameworkSectionProps) {
  const label = FRAMEWORK_LABELS[framework.frameworkId] ?? framework.frameworkId;
  const description = FRAMEWORK_DESCRIPTIONS[framework.frameworkId];

  return (
    <section
      aria-labelledby={`compliance-${framework.frameworkId}-heading`}
      data-testid={`compliance-section-${framework.frameworkId}`}
      className="flex flex-col gap-3"
    >
      <header className="flex flex-col gap-0.5">
        <h2 id={`compliance-${framework.frameworkId}-heading`} className="text-base font-semibold">
          {label}
        </h2>
        {description !== undefined ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile
          testId={`compliance-tile-${framework.frameworkId}-total`}
          label="Controls covered"
          value={framework.totalControls}
        />
        <SummaryTile
          testId={`compliance-tile-${framework.frameworkId}-with-open`}
          label="With open findings"
          value={framework.controlsWithOpenFindings}
          tone="warn"
        />
        <SummaryTile
          testId={`compliance-tile-${framework.frameworkId}-without-evidence`}
          label="Without evidence"
          value={framework.controlsWithoutEvidence}
          tone="muted"
        />
        <SummaryTile
          testId={`compliance-tile-${framework.frameworkId}-open-links`}
          label="Open finding links"
          value={framework.totalOpenFindingLinks}
        />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table
          className="w-full text-left text-sm"
          data-testid={`compliance-table-${framework.frameworkId}`}
        >
          <caption className="sr-only">{`${label} controls and open finding counts`}</caption>
          <thead className="bg-muted/40 text-muted-foreground text-xs tracking-wide uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Control
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Title
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Open findings
              </th>
            </tr>
          </thead>
          <tbody>
            {framework.controls.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="text-muted-foreground px-3 py-4 text-center text-xs"
                  data-testid={`compliance-table-${framework.frameworkId}-empty`}
                >
                  No controls in this framework.
                </td>
              </tr>
            ) : (
              framework.controls.map((control) => (
                <tr
                  key={control.controlId}
                  className={cn(
                    'border-t',
                    control.openFindingCount > 0 ? 'bg-orange-50/30 dark:bg-orange-950/30' : ''
                  )}
                  data-testid={`compliance-row-${framework.frameworkId}-${control.controlIdentifier}`}
                >
                  <th scope="row" className="px-3 py-2 font-mono text-xs">
                    {control.controlIdentifier}
                  </th>
                  <td className="px-3 py-2">{control.title}</td>
                  <td className="px-3 py-2 text-right tabular-nums" aria-live="polite">
                    {control.openFindingCount}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface SummaryTileProps {
  testId: string;
  label: string;
  value: number;
  tone?: 'warn' | 'muted';
}

function SummaryTile({ testId, label, value, tone }: SummaryTileProps) {
  return (
    <div
      data-testid={testId}
      role="region"
      aria-label={label}
      className={cn(
        'bg-card flex flex-col gap-1 rounded-md border p-3',
        tone === 'warn'
          ? 'border-orange-300 dark:border-orange-900'
          : tone === 'muted'
            ? 'border-muted-foreground/20'
            : ''
      )}
    >
      <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
    </div>
  );
}
