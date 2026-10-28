'use client';

import { CircleAlert, CircleCheck, CircleX, Clock, Loader2, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentActivityState } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';

export interface ActivityStateBadgeProps {
  state: AgentActivityState;
  className?: string;
}

const STATE_STYLE: Record<
  AgentActivityState,
  { icon: LucideIcon; className: string; spin?: boolean }
> = {
  [AgentActivityState.Working]: {
    icon: Loader2,
    spin: true,
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  },
  [AgentActivityState.Blocked]: {
    icon: CircleAlert,
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  },
  [AgentActivityState.Waiting]: {
    icon: Clock,
    className: 'border-border bg-muted text-muted-foreground',
  },
  [AgentActivityState.Done]: {
    icon: CircleCheck,
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  [AgentActivityState.Failed]: {
    icon: CircleX,
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
};

/** A feature's agent activity state (spec 149), one colour and icon per state. */
export function ActivityStateBadge({ state, className }: ActivityStateBadgeProps) {
  const { t } = useTranslation('web');
  const { icon: Icon, className: tone, spin } = STATE_STYLE[state];
  return (
    <span
      data-testid="activity-state-badge"
      data-state={state}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tone,
        className
      )}
    >
      <Icon aria-hidden className={cn('size-3', spin && 'animate-spin')} />
      {t(`agentActivity.states.${state}`)}
    </span>
  );
}
