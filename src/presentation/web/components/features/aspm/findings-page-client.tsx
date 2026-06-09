/**
 * FindingsPageClient — client island that wires the filter bar to the
 * URL query string and routes row-clicks to the finding detail page.
 *
 * Feature 098, phase 7, task-44.
 */

'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { FindingsFilterBar } from './findings-filter-bar';
import { FindingsTable, type ApplicationSummary } from './findings-table';
import type { FindingFilter, SecurityFinding } from '@shepai/core/domain/generated/output';

export interface FindingsPageClientProps {
  initialFilter: FindingFilter;
  findings: SecurityFinding[];
  applications?: ApplicationSummary[];
  total: number;
  error: string | null;
}

export function FindingsPageClient({
  initialFilter,
  findings,
  applications,
  total,
  error,
}: FindingsPageClientProps) {
  const router = useRouter();
  const params = useSearchParams();

  const onFilterChange = useCallback(
    (next: FindingFilter) => {
      const sp = new URLSearchParams(params.toString());
      setList(sp, 'severity', next.severities);
      setList(sp, 'domain', next.findingDomains);
      setList(sp, 'state', next.states);
      setList(sp, 'owner', next.ownerIds);
      setList(sp, 'rule', next.ruleIds);
      setList(sp, 'app', next.applicationIds);
      setList(sp, 'cve', next.cveIds);
      if (next.kev === undefined) sp.delete('kev');
      else sp.set('kev', String(next.kev));
      // Next.js typed routes don't yet know about newly-added /aspm routes —
      // cast so the page-level URL pattern stays type-safe at the call site.
      router.push(
        `/aspm/findings?${sp.toString()}` as unknown as Parameters<typeof router.push>[0]
      );
    },
    [router, params]
  );

  const onRowClick = useCallback(
    (f: SecurityFinding) => {
      router.push(`/aspm/findings/${f.id}` as unknown as Parameters<typeof router.push>[0]);
    },
    [router]
  );

  return (
    <div className="flex flex-col gap-3">
      <FindingsFilterBar filter={initialFilter} onChange={onFilterChange} />
      <div className="text-muted-foreground text-xs">
        Showing {findings.length} of {total} matching finding{total === 1 ? '' : 's'}
      </div>
      <FindingsTable
        findings={findings}
        applications={applications}
        error={error}
        onRowClick={onRowClick}
      />
    </div>
  );
}

function setList(sp: URLSearchParams, key: string, list: readonly string[] | undefined): void {
  if (list === undefined || list.length === 0) {
    sp.delete(key);
    return;
  }
  sp.set(key, list.join(','));
}
