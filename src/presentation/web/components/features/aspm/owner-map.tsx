/**
 * OwnerMap — rollup of owners with their open-finding workload
 * (feature 098, phase 7, task-48 / FR-3).
 *
 * Presentation only. The parent page composes the OwnerMapRow data by
 * joining Owner / Team / BusinessUnit with finding counts (the use case
 * does the actual aggregation). The component renders a sortable grid
 * grouped by business unit → team.
 */

'use client';

import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { type CanonicalSeverity } from '@shepai/core/domain/generated/output';

export interface OwnerRollup {
  ownerId: string;
  ownerName: string;
  ownerHandle?: string;
  teamId?: string;
  teamName?: string;
  businessUnitId?: string;
  businessUnitName?: string;
  openFindingCount: number;
  severityCounts: { severity: CanonicalSeverity; count: number }[];
}

export interface OwnerMapProps {
  owners?: OwnerRollup[];
  loading?: boolean;
  error?: string | null;
  className?: string;
}

interface BusinessUnitGroup {
  businessUnitName: string;
  teams: Map<string, OwnerRollup[]>;
}

export function OwnerMap({ owners, loading, error, className }: OwnerMapProps) {
  const grouped = useMemo(() => groupByBusinessUnit(owners ?? []), [owners]);

  if (loading) {
    return (
      <div
        data-testid="owner-map-loading"
        className={cn('flex h-32 items-center justify-center rounded-md border', className)}
        aria-busy="true"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-sm">Loading owners…</span>
      </div>
    );
  }
  if (error !== null && error !== undefined && error.length > 0) {
    return (
      <div
        data-testid="owner-map-error"
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
  if (!owners || owners.length === 0) {
    return (
      <div
        data-testid="owner-map-empty"
        className={cn(
          'flex h-32 flex-col items-center justify-center gap-1 rounded-md border',
          className
        )}
      >
        <span className="text-sm font-medium">No owners yet</span>
        <span className="text-muted-foreground text-xs">
          Run a scan to derive owners from <code>git</code> commit history, or check in{' '}
          <code>.shep/ownership.yaml</code>.
        </span>
      </div>
    );
  }

  return (
    <div data-testid="owner-map" className={cn('flex flex-col gap-3', className)}>
      {grouped.map((group) => (
        <BusinessUnitGroupView key={group.businessUnitName} group={group} />
      ))}
    </div>
  );
}

function BusinessUnitGroupView({ group }: { group: BusinessUnitGroup }) {
  const groupOpen = Array.from(group.teams.values())
    .flat()
    .reduce((sum, r) => sum + r.openFindingCount, 0);
  return (
    <section
      data-testid={`owner-map-bu-${group.businessUnitName}`}
      aria-labelledby={`owner-map-bu-heading-${group.businessUnitName}`}
      className="bg-card rounded-md border"
    >
      <header className="flex items-baseline justify-between border-b px-3 py-2">
        <h3 id={`owner-map-bu-heading-${group.businessUnitName}`} className="text-sm font-semibold">
          {group.businessUnitName}
        </h3>
        <span className="text-muted-foreground text-xs tabular-nums">{groupOpen} open</span>
      </header>
      <div className="flex flex-col">
        {Array.from(group.teams.entries()).map(([teamName, members]) => (
          <TeamRow key={teamName} teamName={teamName} members={members} />
        ))}
      </div>
    </section>
  );
}

function TeamRow({ teamName, members }: { teamName: string; members: OwnerRollup[] }) {
  return (
    <div className="border-t first:border-t-0">
      <div className="bg-muted/30 px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase">
        {teamName}
      </div>
      <ul role="list" className="divide-y">
        {members.map((m) => (
          <li
            key={m.ownerId}
            data-testid={`owner-map-row-${m.ownerId}`}
            className="flex items-center gap-3 px-3 py-2 text-sm"
          >
            <span className="flex flex-col">
              <span className="font-medium">{m.ownerName}</span>
              {m.ownerHandle !== undefined ? (
                <span className="text-muted-foreground text-[11px]">{m.ownerHandle}</span>
              ) : null}
            </span>
            <span className="ml-auto flex items-center gap-2 text-xs tabular-nums">
              <span className="text-muted-foreground">{m.openFindingCount} open</span>
              {m.severityCounts.map((s) =>
                s.count > 0 ? (
                  <span
                    key={s.severity}
                    data-testid={`owner-map-sev-${m.ownerId}-${s.severity.toLowerCase()}`}
                    className="bg-card rounded-md border px-1.5 py-0.5"
                    title={`${s.severity}: ${s.count}`}
                  >
                    {s.severity[0]} {s.count}
                  </span>
                ) : null
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function groupByBusinessUnit(rows: OwnerRollup[]): BusinessUnitGroup[] {
  const out = new Map<string, BusinessUnitGroup>();
  for (const r of rows) {
    const buName = r.businessUnitName ?? 'No business unit';
    const teamName = r.teamName ?? 'No team';
    let group = out.get(buName);
    if (!group) {
      group = { businessUnitName: buName, teams: new Map() };
      out.set(buName, group);
    }
    let members = group.teams.get(teamName);
    if (!members) {
      members = [];
      group.teams.set(teamName, members);
    }
    members.push(r);
  }
  return Array.from(out.values());
}
