'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { NotificationEvent } from '@shepai/core/domain/generated/output';
import { NotificationEventType, NotificationSeverity } from '@shepai/core/domain/generated/output';
import { useAgentEventsContext } from './agent-events-provider';
import { useSoundAction } from './use-sound-action';
import type { SoundAction } from './use-sound-action';

const SEVERITY_TO_TOAST: Record<NotificationSeverity, 'success' | 'error' | 'warning' | 'info'> = {
  [NotificationSeverity.Success]: 'success',
  [NotificationSeverity.Error]: 'error',
  [NotificationSeverity.Warning]: 'warning',
  [NotificationSeverity.Info]: 'info',
};

function dispatchToast(event: NotificationEvent, navigate?: (path: string) => void): void {
  const method = SEVERITY_TO_TOAST[event.severity] ?? 'info';
  const isActionable =
    event.eventType === NotificationEventType.WaitingApproval ||
    event.eventType === NotificationEventType.MergeReviewReady;
  toast[method](event.featureName, {
    description: event.message,
    ...(isActionable &&
      navigate && {
        action: {
          label: 'Review',
          onClick: () => {
            navigate(`/feature/${event.featureId}`);
          },
        },
      }),
  });
}

const SEVERITY_TO_ACTION: Record<NotificationSeverity, SoundAction> = {
  [NotificationSeverity.Success]: 'notification-success',
  [NotificationSeverity.Error]: 'notification-error',
  [NotificationSeverity.Warning]: 'notification-warning',
  [NotificationSeverity.Info]: 'notification-info',
};

export function useNotifications(enabled = true): void {
  const router = useRouter();
  const { events } = useAgentEventsContext();

  const successSound = useSoundAction('notification-success');
  const errorSound = useSoundAction('notification-error');
  const warningSound = useSoundAction('notification-warning');
  const infoSound = useSoundAction('notification-info');

  const soundsByAction = useMemo<Record<string, { play: () => void }>>(
    () => ({
      'notification-success': successSound,
      'notification-error': errorSound,
      'notification-warning': warningSound,
      'notification-info': infoSound,
    }),
    [successSound, errorSound, warningSound, infoSound]
  );

  // Track how many events from the array we've already processed.
  // Using the array index (instead of lastEvent) prevents React batching
  // from silently dropping events when multiple SSE messages arrive together.
  const processedCountRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      // Keep the cursor in sync so a later enable doesn't replay the
      // whole backlog as a burst of toasts.
      processedCountRef.current = events.length;
      return;
    }
    if (events.length <= processedCountRef.current) return;

    const newEvents = events.slice(processedCountRef.current);
    processedCountRef.current = events.length;

    for (const event of newEvents) {
      // Only notify for actionable events and completion celebrations.
      // MergeReviewReady is Info severity but always shown as it requires user action.
      const isAlwaysShown = event.eventType === NotificationEventType.MergeReviewReady;
      if (
        !isAlwaysShown &&
        event.severity !== NotificationSeverity.Error &&
        event.severity !== NotificationSeverity.Warning &&
        event.severity !== NotificationSeverity.Success
      ) {
        continue;
      }

      dispatchToast(event, (path) => router.push(path as Parameters<typeof router.push>[0]));

      const actionName = SEVERITY_TO_ACTION[event.severity];
      soundsByAction[actionName]?.play();
    }
  }, [enabled, events, soundsByAction, router]);
}
