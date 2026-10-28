'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAgentActivity } from '@/hooks/use-agent-activity';
import { useActivityNotify } from '@/hooks/use-activity-notify';
import { requestBrowserNotifications, showBrowserNotification } from '@/lib/browser-notification';
import type { AgentActivityView } from '@/lib/agent-activity-view';
import { FeatureActivityCard } from './feature-activity-card';

export interface FeatureActivitySectionProps {
  featureId: string;
  className?: string;
}

/**
 * One feature's live agent activity (spec 148), for the feature drawer: the
 * card fed by GET /api/agent-activity, and "Notify me" over the wait route.
 */
export function FeatureActivitySection({ featureId, className }: FeatureActivitySectionProps) {
  const { t } = useTranslation('web');
  const { snapshot, loading, error, notFound, refresh } = useAgentActivity({
    featureId,
    includeSettled: true,
  });

  const onMatch = useCallback(
    (activity: AgentActivityView) => {
      const title = t('agentActivity.notify.title', {
        name: activity.name,
        state: t(`agentActivity.states.${activity.state}`),
      });
      const body = t(`agentActivity.reasons.${activity.reason}`);
      toast(title, { description: body });
      showBrowserNotification(title, body);
      void refresh();
    },
    [t, refresh]
  );
  const notify = useActivityNotify({ featureId, onMatch });

  const onStart = useCallback(() => {
    void requestBrowserNotifications();
    notify.start();
  }, [notify]);

  return (
    <FeatureActivityCard
      className={className}
      activity={snapshot?.activities[0]}
      loading={loading}
      error={error}
      notFound={notFound}
      inDrawer
      notify={{ watching: notify.watching, error: notify.error, onStart, onStop: notify.stop }}
    />
  );
}
