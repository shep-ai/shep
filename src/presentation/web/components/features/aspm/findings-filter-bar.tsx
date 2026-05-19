/**
 * FindingsFilterBar — minimal filter controls over the FindingFilter
 * primitive (feature 098, phase 3, FR-14). Emits a partial filter on
 * every change; presentation only — all filtering happens use-case-side.
 *
 * Keyboard accessible: every control reachable via tab order; labels and
 * `aria-*` set on each checkbox group / select.
 */

'use client';

import { useMemo } from 'react';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type FindingFilter,
} from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';

const SEVERITY_OPTIONS: CanonicalSeverity[] = [
  CanonicalSeverity.Critical,
  CanonicalSeverity.High,
  CanonicalSeverity.Medium,
  CanonicalSeverity.Low,
  CanonicalSeverity.Info,
];

const DOMAIN_OPTIONS: FindingDomain[] = [
  FindingDomain.Code,
  FindingDomain.Dependency,
  FindingDomain.Secret,
  FindingDomain.Container,
  FindingDomain.Cloud,
  FindingDomain.Api,
  FindingDomain.Identity,
  FindingDomain.Runtime,
  FindingDomain.Compliance,
  FindingDomain.Ai,
];

const STATE_OPTIONS: FindingState[] = [
  FindingState.Open,
  FindingState.Triaged,
  FindingState.InProgress,
  FindingState.Resolved,
  FindingState.Closed,
  FindingState.Exception,
];

export interface FindingsFilterBarProps {
  filter: FindingFilter;
  onChange: (next: FindingFilter) => void;
  className?: string;
}

function toggle<T>(list: readonly T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

export function FindingsFilterBar({ filter, onChange, className }: FindingsFilterBarProps) {
  const totalActive = useMemo(() => {
    const s = filter.severities?.length ?? 0;
    const d = filter.findingDomains?.length ?? 0;
    const st = filter.states?.length ?? 0;
    return s + d + st + (filter.kev === true ? 1 : 0);
  }, [filter]);

  return (
    <div
      data-testid="findings-filter-bar"
      className={cn('flex flex-col gap-3 rounded-md border p-3', className)}
      role="group"
      aria-label="Findings filters"
    >
      <FilterGroup label="Severity">
        {SEVERITY_OPTIONS.map((sev) => (
          <FilterToggle
            key={sev}
            label={sev}
            active={filter.severities?.includes(sev) ?? false}
            onClick={() => onChange({ ...filter, severities: toggle(filter.severities, sev) })}
          />
        ))}
      </FilterGroup>
      <FilterGroup label="Domain">
        {DOMAIN_OPTIONS.map((dom) => (
          <FilterToggle
            key={dom}
            label={dom}
            active={filter.findingDomains?.includes(dom) ?? false}
            onClick={() =>
              onChange({ ...filter, findingDomains: toggle(filter.findingDomains, dom) })
            }
          />
        ))}
      </FilterGroup>
      <FilterGroup label="State">
        {STATE_OPTIONS.map((st) => (
          <FilterToggle
            key={st}
            label={st}
            active={filter.states?.includes(st) ?? false}
            onClick={() => onChange({ ...filter, states: toggle(filter.states, st) })}
          />
        ))}
      </FilterGroup>
      <FilterGroup label="Other">
        <FilterToggle
          label="KEV-listed only"
          active={filter.kev === true}
          onClick={() => onChange({ ...filter, kev: filter.kev === true ? undefined : true })}
        />
      </FilterGroup>
      {totalActive > 0 ? (
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>{totalActive} active filter(s)</span>
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-foreground underline-offset-2 hover:underline focus:underline focus:outline-none"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function FilterToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        'focus-visible:ring-ring focus:outline-none focus-visible:ring-2',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background text-foreground hover:bg-accent'
      )}
    >
      {label}
    </button>
  );
}
