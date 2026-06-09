/**
 * SlaBadge — small colored chip that renders an SLA band for a finding
 * (feature 098, phase 6, task-39 / FR-20).
 *
 * Bands: Healthy / AtRisk / Breached / Exception. Colors meet WCAG 2.1 AA
 * contrast on both light and dark backgrounds; the label is also passed
 * as an `aria-label` so screen readers don't have to interpret color.
 */

import { cn } from '@/lib/utils';
import { SlaState } from '@shepai/core/domain/generated/output';

export const SLA_BADGE_STATE = {
  Healthy: 'Healthy',
  AtRisk: 'AtRisk',
  Breached: 'Breached',
  Exception: 'Exception',
} as const;

export type SlaBadgeState = (typeof SLA_BADGE_STATE)[keyof typeof SLA_BADGE_STATE];

const STATE_STYLES: Record<SlaBadgeState, string> = {
  [SLA_BADGE_STATE.Healthy]:
    'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800',
  [SLA_BADGE_STATE.AtRisk]:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800',
  [SLA_BADGE_STATE.Breached]:
    'bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-100 dark:border-red-800',
  [SLA_BADGE_STATE.Exception]:
    'bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600',
};

const STATE_LABEL: Record<SlaBadgeState, string> = {
  [SLA_BADGE_STATE.Healthy]: 'On track',
  [SLA_BADGE_STATE.AtRisk]: 'At risk',
  [SLA_BADGE_STATE.Breached]: 'Breached',
  [SLA_BADGE_STATE.Exception]: 'Exception',
};

const STATE_FULL_DESCRIPTION: Record<SlaBadgeState, string> = {
  [SLA_BADGE_STATE.Healthy]: 'SLA on track (under 50% of window elapsed)',
  [SLA_BADGE_STATE.AtRisk]: 'SLA at risk (50%-100% of window elapsed)',
  [SLA_BADGE_STATE.Breached]: 'SLA breached (window exceeded)',
  [SLA_BADGE_STATE.Exception]: 'Excluded by active risk exception',
};

export interface SlaBadgeProps {
  state: SlaBadgeState | SlaState;
  className?: string;
}

function asBadgeState(state: SlaBadgeState | SlaState): SlaBadgeState {
  switch (state) {
    case SlaState.Healthy:
      return SLA_BADGE_STATE.Healthy;
    case SlaState.AtRisk:
      return SLA_BADGE_STATE.AtRisk;
    case SlaState.Breached:
      return SLA_BADGE_STATE.Breached;
    default:
      return state as SlaBadgeState;
  }
}

export function SlaBadge({ state, className }: SlaBadgeProps) {
  const badgeState = asBadgeState(state);
  const label = STATE_LABEL[badgeState];
  return (
    <span
      data-testid={`sla-badge-${badgeState.toLowerCase()}`}
      aria-label={`SLA: ${STATE_FULL_DESCRIPTION[badgeState]}`}
      title={STATE_FULL_DESCRIPTION[badgeState]}
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        STATE_STYLES[badgeState],
        className
      )}
    >
      {label}
    </span>
  );
}
