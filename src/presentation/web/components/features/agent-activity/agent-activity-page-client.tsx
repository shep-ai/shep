'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AgentActivityState } from '@shepai/core/domain/generated/output';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityStateBadge } from '@/components/agent-activity/activity-state-badge';
import { AgentActivityList } from '@/components/agent-activity/agent-activity-list';
import { useAgentActivity } from '@/hooks/use-agent-activity';
import { cn } from '@/lib/utils';

/** Most urgent first, as the summary reads. */
const COUNT_ORDER = [
  AgentActivityState.Blocked,
  AgentActivityState.Working,
  AgentActivityState.Waiting,
  AgentActivityState.Failed,
  AgentActivityState.Done,
] as const;
const LOADING_ROWS = 3;
const SHOW_FINISHED_ID = 'agent-activity-show-finished';

export interface AgentActivityPageClientProps {
  className?: string;
}

/**
 * The Agent activity page (spec 149): the web `shep feat status` — every
 * feature's agent, what it is doing and why, live.
 */
export function AgentActivityPageClient({ className }: AgentActivityPageClientProps) {
  const { t } = useTranslation('web');
  const [showFinished, setShowFinished] = useState(false);
  const { snapshot, loading, error } = useAgentActivity({ includeSettled: showFinished });
  const blocked = snapshot?.counts[AgentActivityState.Blocked] ?? 0;

  return (
    <div data-testid="agent-activity-page" className={cn('flex flex-col gap-4 p-6', className)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {t('agentActivity.page.title')}
            {blocked > 0 ? (
              <span
                data-testid="agent-activity-needs-you"
                className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300"
              >
                {t('agentActivity.page.needsYou', { count: blocked })}
              </span>
            ) : null}
          </h1>
          <p className="text-muted-foreground text-sm">{t('agentActivity.page.description')}</p>
        </div>
        <label htmlFor={SHOW_FINISHED_ID} className="flex items-center gap-2 text-sm">
          <Switch
            id={SHOW_FINISHED_ID}
            checked={showFinished}
            onCheckedChange={setShowFinished}
            aria-label={t('agentActivity.page.showFinished')}
          />
          {t('agentActivity.page.showFinished')}
        </label>
      </header>

      {snapshot ? (
        <div className="flex flex-wrap gap-3" data-testid="agent-activity-counts">
          {COUNT_ORDER.map((state) => (
            <span key={state} className="flex items-center gap-1.5">
              <ActivityStateBadge state={state} />
              <span
                data-testid={`agent-activity-count-${state}`}
                className="text-sm font-semibold tabular-nums"
              >
                {snapshot.counts[state]}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <p data-testid="agent-activity-page-error" className="text-destructive text-sm">
          {t('agentActivity.page.error', { error })}
        </p>
      ) : null}

      {snapshot ? (
        <AgentActivityList activities={snapshot.activities} />
      ) : loading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: LOADING_ROWS }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
