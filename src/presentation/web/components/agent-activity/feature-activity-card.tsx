'use client';

import type { ReactNode } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentActivityState } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AgentActivityView } from '@/lib/agent-activity-view';
import { ActivityStateBadge } from './activity-state-badge';
import { ActivityNextStepLink } from './activity-next-step-link';
import { activityNextStep, featureHref } from './activity-next-step';

/** States worth waiting from: the default wait targets are everything else. */
const WAITABLE_STATES: ReadonlySet<AgentActivityState> = new Set([
  AgentActivityState.Working,
  AgentActivityState.Waiting,
]);

export interface FeatureActivityNotify {
  watching: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}

export interface FeatureActivityCardProps {
  activity?: AgentActivityView;
  loading?: boolean;
  error?: string | null;
  notFound?: boolean;
  /** Rendered inside the feature's own drawer: never link back to it. */
  inDrawer?: boolean;
  /** "Notify me"; omitted, the card has no notify control. */
  notify?: FeatureActivityNotify;
  className?: string;
}

function Shell({
  children,
  state,
  busy,
  className,
}: {
  children: ReactNode;
  state?: AgentActivityState;
  busy?: boolean;
  className?: string;
}) {
  return (
    <section
      data-testid="feature-activity-card"
      data-state={state}
      aria-busy={busy ? true : undefined}
      className={cn(
        'bg-card flex flex-col gap-2 rounded-lg border p-3 text-xs',
        state === AgentActivityState.Blocked && 'border-amber-500/40',
        state === AgentActivityState.Failed && 'border-destructive/40',
        className
      )}
    >
      {children}
    </section>
  );
}

function Field({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span data-testid={testId} className="min-w-0 break-words">
        {children}
      </span>
    </div>
  );
}

/**
 * A feature's agent activity in words (spec 148): the web `shep feat status`
 * for one feature — state, why, what the agent asks, the phase, and the next
 * step — with "Notify me", the web `shep feat wait`.
 */
export function FeatureActivityCard({
  activity,
  loading = false,
  error = null,
  notFound = false,
  inDrawer = false,
  notify,
  className,
}: FeatureActivityCardProps) {
  const { t } = useTranslation('web');
  const title = (
    <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
      {t('agentActivity.card.title')}
    </span>
  );

  if (!activity) {
    let message = t('agentActivity.card.loading');
    if (error) message = t('agentActivity.card.error', { error });
    else if (notFound) message = t('agentActivity.card.notFound');
    const busy = loading && error === null && !notFound;
    return (
      <Shell busy={busy} className={className}>
        {title}
        <span className={cn('text-muted-foreground', error && 'text-destructive')}>{message}</span>
      </Shell>
    );
  }

  const step = activityNextStep(activity);
  const stepIsHere = inDrawer && step?.href === featureHref(activity.featureId);
  const canNotify = notify && WAITABLE_STATES.has(activity.state);

  return (
    <Shell state={activity.state} className={className}>
      <div className="flex items-center justify-between gap-2">
        {title}
        <ActivityStateBadge state={activity.state} />
      </div>
      <Field label={t('agentActivity.labels.why')} testId="feature-activity-why">
        {t(`agentActivity.reasons.${activity.reason}`)}
      </Field>
      {activity.pendingQuestion ? (
        <Field label={t('agentActivity.labels.asks')} testId="feature-activity-asks">
          {activity.pendingQuestion.prompt}
        </Field>
      ) : null}
      <Field label={t('agentActivity.labels.phase')} testId="feature-activity-phase">
        <code className="font-mono">{activity.phase}</code>
        {activity.runStatus ? (
          <span className="text-muted-foreground"> · {activity.runStatus}</span>
        ) : null}
      </Field>
      {activity.error ? (
        <Field label={t('agentActivity.labels.error')} testId="feature-activity-error">
          <span className="text-destructive">{activity.error}</span>
        </Field>
      ) : null}
      {error ? (
        <span className="text-destructive">{t('agentActivity.card.error', { error })}</span>
      ) : null}
      {step ? (
        <Field label={t('agentActivity.labels.next')} testId="feature-activity-next">
          {stepIsHere ? (
            t(`agentActivity.next.inDrawer.${step.labelKey}`)
          ) : (
            <ActivityNextStepLink step={step} />
          )}
        </Field>
      ) : null}
      {notify?.watching ? (
        <div
          data-testid="feature-activity-watching"
          className="bg-muted/60 flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
        >
          <span className="flex items-center gap-1.5">
            <Loader2 aria-hidden className="size-3 animate-spin" />
            {t('agentActivity.notify.watching')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={notify.onStop}
          >
            <BellOff aria-hidden className="size-3" />
            {t('agentActivity.notify.stop')}
          </Button>
        </div>
      ) : canNotify ? (
        <div className="flex items-center justify-end gap-2">
          {notify.error ? (
            <span className="text-destructive mr-auto">
              {t('agentActivity.notify.failed', { error: notify.error })}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={notify.onStart}
          >
            <Bell aria-hidden className="size-3" />
            {t('agentActivity.notify.start')}
          </Button>
        </div>
      ) : null}
    </Shell>
  );
}
