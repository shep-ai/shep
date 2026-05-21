/**
 * FindingsTable — paginated table of SecurityFinding rows
 * (feature 098, phase 3, FR-14 / NFR-8).
 *
 * Presentation only — data is fetched by the page via the list-findings
 * use case and passed in as a prop. The table itself does not branch on
 * domain logic, just renders a row per finding plus loading / empty /
 * error placeholders.
 *
 * Keyboard accessible: every row is a button (full-row click target), and
 * the `<table>` is wrapped in scrollable region with `role="region"` +
 * `aria-label` so screen readers can announce it.
 */

'use client';

import { cn } from '@/lib/utils';
import { SeverityBadge } from './severity-badge';
import { AspmScanDialog } from './aspm-scan-dialog/aspm-scan-dialog';
import type { SecurityFinding } from '@shepai/core/domain/generated/output';

export interface ApplicationSummary {
  id: string;
  name: string;
  slug: string;
}

export interface FindingsTableProps {
  findings: SecurityFinding[];
  /**
   * Applications indexed by id (or as an array). Used to resolve the
   * Application column from the SecurityFinding.applicationId UUID.
   * When omitted, the column falls back to a truncated UUID.
   */
  applications?: ApplicationSummary[];
  loading?: boolean;
  error?: string | null;
  onRowClick?: (finding: SecurityFinding) => void;
  className?: string;
}

export function FindingsTable({
  findings,
  applications,
  loading,
  error,
  onRowClick,
  className,
}: FindingsTableProps) {
  const applicationsById = new Map<string, ApplicationSummary>(
    (applications ?? []).map((a) => [a.id, a])
  );
  if (loading) {
    return (
      <div
        data-testid="findings-table-loading"
        className={cn('flex h-32 items-center justify-center rounded-md border', className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-sm">Loading findings…</span>
      </div>
    );
  }

  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <div
        data-testid="findings-table-error"
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

  if (findings.length === 0) {
    return (
      <div
        data-testid="findings-table-empty"
        className={cn(
          'flex h-32 flex-col items-center justify-center gap-2 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">No findings</span>
        <span className="text-muted-foreground text-xs">
          Upload a SARIF or SBOM document to populate this view
        </span>
        <AspmScanDialog />
      </div>
    );
  }

  return (
    <div
      className={cn('overflow-x-auto rounded-md border', className)}
      role="region"
      aria-label="Security findings"
    >
      <table data-testid="findings-table" className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-[11px] tracking-wide uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Severity
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Application
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Title
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Domain
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Location
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              State
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Source
            </th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding) => (
            <FindingsTableRow
              key={finding.id}
              finding={finding}
              application={applicationsById.get(finding.applicationId)}
              onClick={onRowClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  finding: SecurityFinding;
  application?: ApplicationSummary;
  onClick?: (finding: SecurityFinding) => void;
}

function FindingsTableRow({ finding, application, onClick }: RowProps) {
  const location =
    finding.locationPath !== undefined
      ? finding.locationLine !== undefined
        ? `${finding.locationPath}:${finding.locationLine}`
        : finding.locationPath
      : '—';
  const interactive = typeof onClick === 'function';
  return (
    <tr
      data-testid={`findings-table-row-${finding.id}`}
      className={cn(
        'border-t transition-colors',
        interactive ? 'hover:bg-accent focus-within:bg-accent cursor-pointer' : ''
      )}
      onClick={interactive ? () => onClick!(finding) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick!(finding);
              }
            }
          : undefined
      }
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? 'button' : undefined}
      aria-label={interactive ? `Open finding ${finding.title}` : undefined}
    >
      <td className="px-3 py-2 align-top">
        <SeverityBadge severity={finding.canonicalSeverity} />
      </td>
      <td className="px-3 py-2 align-top">
        {application ? (
          <div className="flex flex-col">
            <span className="font-medium">{application.name}</span>
            <span className="text-muted-foreground text-[11px]">{application.slug}</span>
          </div>
        ) : (
          <span
            className="text-muted-foreground font-mono text-[11px]"
            title={finding.applicationId}
          >
            {finding.applicationId.substring(0, 8)}…
          </span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col">
          <span className="font-medium">{finding.title}</span>
          <span className="text-muted-foreground text-[11px]">{finding.ruleId}</span>
        </div>
      </td>
      <td className="px-3 py-2 align-top text-xs">{finding.findingDomain}</td>
      <td className="px-3 py-2 align-top font-mono text-[11px]">{location}</td>
      <td className="px-3 py-2 align-top text-xs">{finding.state}</td>
      <td className="text-muted-foreground px-3 py-2 align-top text-[11px]">{finding.source}</td>
    </tr>
  );
}
