'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { AgentActivityView } from '@/lib/agent-activity-view';
import { ActivityStateBadge } from './activity-state-badge';
import { ActivityNextStepLink } from './activity-next-step-link';
import { activityNextStep, featureHref } from './activity-next-step';

export interface AgentActivityListProps {
  /** Most urgent first, as the use case orders them. */
  activities: AgentActivityView[];
  className?: string;
}

function repositoryName(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? path;
}

/** Every feature's agent activity (spec 149): the web `shep feat status`. */
export function AgentActivityList({ activities, className }: AgentActivityListProps) {
  const { t } = useTranslation('web');

  if (activities.length === 0) {
    return (
      <div
        data-testid="agent-activity-list"
        className={cn(
          'text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm',
          className
        )}
      >
        {t('agentActivity.list.empty')}
      </div>
    );
  }

  return (
    <ul
      data-testid="agent-activity-list"
      className={cn('bg-card divide-y rounded-lg border', className)}
    >
      {activities.map((activity) => {
        const step = activityNextStep(activity);
        return (
          <li
            key={activity.featureId}
            data-testid="agent-activity-row"
            data-state={activity.state}
            className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <ActivityStateBadge state={activity.state} className="w-fit" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="truncate text-sm font-medium">{activity.name}</span>
                <span className="text-muted-foreground font-mono text-[11px]">
                  {repositoryName(activity.repositoryPath)} · {activity.phase}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                {t(`agentActivity.reasons.${activity.reason}`)}
              </p>
              {activity.pendingQuestion ? (
                <p data-testid="agent-activity-row-asks" className="mt-0.5 text-xs">
                  “{activity.pendingQuestion.prompt}”
                </p>
              ) : null}
              {activity.error ? (
                <p className="text-destructive mt-0.5 truncate text-xs" title={activity.error}>
                  {activity.error}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {step ? <ActivityNextStepLink step={step} /> : null}
              {step?.href !== featureHref(activity.featureId) ? (
                <Link
                  href={featureHref(activity.featureId) as Route}
                  className="text-muted-foreground hover:text-foreground text-xs hover:underline"
                >
                  {t('agentActivity.list.open')}
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
