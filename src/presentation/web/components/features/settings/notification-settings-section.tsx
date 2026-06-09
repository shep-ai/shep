'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Bell, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { updateSettingsAction } from '@/app/actions/update-settings';
import type { NotificationPreferences } from '@shepai/core/domain/generated/output';

const AGENT_EVENT_TOGGLES = [
  { key: 'agentStarted', label: 'Agent Started' },
  { key: 'phaseCompleted', label: 'Phase Completed' },
  { key: 'waitingApproval', label: 'Waiting Approval' },
  { key: 'agentCompleted', label: 'Agent Completed' },
  { key: 'agentFailed', label: 'Agent Failed' },
] as const;

const PR_EVENT_TOGGLES = [
  { key: 'mergeReviewReady', label: 'Merge Review Ready' },
  { key: 'prMerged', label: 'PR Merged' },
  { key: 'prClosed', label: 'PR Closed' },
  { key: 'prChecksPassed', label: 'PR Checks Passed' },
  { key: 'prChecksFailed', label: 'PR Checks Failed' },
  { key: 'prBlocked', label: 'PR Blocked' },
] as const;

const WORKFLOW_EVENT_TOGGLES = [
  { key: 'workflowStarted', label: 'Workflow Started' },
  { key: 'workflowCompleted', label: 'Workflow Completed' },
  { key: 'workflowFailed', label: 'Workflow Failed' },
] as const;

export interface NotificationSettingsSectionProps {
  notifications: NotificationPreferences;
}

export function NotificationSettingsSection({ notifications }: NotificationSettingsSectionProps) {
  const [inApp, setInApp] = useState(notifications.inApp.enabled);
  const [events, setEvents] = useState({ ...notifications.events });
  const [isPending, startTransition] = useTransition();
  const [showSaved, setShowSaved] = useState(false);
  const prevPendingRef = useRef(false);

  useEffect(() => {
    if (prevPendingRef.current && !isPending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevPendingRef.current = isPending;
  }, [isPending]);

  function save(payload: { notifications: Partial<NotificationPreferences> }) {
    startTransition(async () => {
      const result = await updateSettingsAction(payload);
      if (!result.success) {
        toast.error(result.error ?? 'Failed to save notification settings');
      }
    });
  }

  function buildFullPayload(
    overrides: {
      inApp?: boolean;
      events?: typeof events;
    } = {}
  ) {
    return {
      notifications: {
        inApp: { enabled: overrides.inApp ?? inApp },
        events: overrides.events ?? events,
      },
    };
  }

  function handleInAppChange(value: boolean) {
    setInApp(value);
    save(buildFullPayload({ inApp: value }));
  }

  function handleEventChange(key: string, value: boolean) {
    const newEvents = { ...events, [key]: value };
    setEvents(newEvents);
    save(buildFullPayload({ events: newEvents }));
  }

  return (
    <Card id="notifications" className="scroll-mt-6" data-testid="notification-settings-section">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="text-muted-foreground h-4 w-4" />
            <CardTitle>Notifications</CardTitle>
          </div>
          {isPending ? <span className="text-muted-foreground text-xs">Saving...</span> : null}
          {showSaved && !isPending ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              Saved
            </span>
          ) : null}
        </div>
        <CardDescription>Configure notification channels and event preferences</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Channels</h3>
          <div className="flex items-center justify-between">
            <Label htmlFor="notif-in-app">In-App</Label>
            <Switch
              id="notif-in-app"
              data-testid="switch-in-app"
              checked={inApp}
              onCheckedChange={handleInAppChange}
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Agent Events</h3>
          {AGENT_EVENT_TOGGLES.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={`notif-event-${key}`}>{label}</Label>
              <Switch
                id={`notif-event-${key}`}
                data-testid={`switch-event-${key}`}
                checked={events[key]}
                onCheckedChange={(v) => handleEventChange(key, v)}
              />
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">PR Events</h3>
          {PR_EVENT_TOGGLES.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={`notif-event-${key}`}>{label}</Label>
              <Switch
                id={`notif-event-${key}`}
                data-testid={`switch-event-${key}`}
                checked={events[key]}
                onCheckedChange={(v) => handleEventChange(key, v)}
              />
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Workflow Events</h3>
          {WORKFLOW_EVENT_TOGGLES.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={`notif-event-${key}`}>{label}</Label>
              <Switch
                id={`notif-event-${key}`}
                data-testid={`switch-event-${key}`}
                checked={events[key]}
                onCheckedChange={(v) => handleEventChange(key, v)}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
