'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { OnboardingStep } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  getTelemetryStatus,
  recordOnboardingStep,
  setTelemetryPreferences,
  type TelemetryStatusView,
} from '@/app/actions/telemetry';
import { TelemetryPreferences, type TelemetryPreferenceChange } from './telemetry-preferences';
import { TelemetryFieldsList } from './telemetry-fields-list';

/** Remembers, per browser, that the notice was acknowledged. */
export const TELEMETRY_NOTICE_DISMISSED_KEY = 'shep:telemetry-notice-dismissed';

export interface TelemetryNoticeCardViewProps {
  status: TelemetryStatusView;
  onTurnOff: () => void;
  onDismiss: () => void;
  onChange: (change: TelemetryPreferenceChange) => void;
  pending?: boolean;
  error?: string | null;
  className?: string;
}

/** The first-run usage-metrics notice (spec 133), presentational. */
export function TelemetryNoticeCardView({
  status,
  onTurnOff,
  onDismiss,
  onChange,
  pending = false,
  error = null,
  className,
}: TelemetryNoticeCardViewProps) {
  const { t } = useTranslation('web');
  return (
    <section
      data-testid="telemetry-notice-card"
      aria-labelledby="telemetry-notice-title"
      className={cn('bg-muted/30 w-full rounded-lg border p-4 text-start', className)}
    >
      <div className="flex items-center gap-2">
        <BarChart3 aria-hidden="true" className="text-muted-foreground size-4" />
        <h2 id="telemetry-notice-title" className="text-sm font-medium">
          {t('telemetry.notice.title')}
        </h2>
      </div>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        {t('telemetry.notice.intro')}
      </p>
      <TelemetryFieldsList className="mt-3" />
      <TelemetryPreferences
        className="mt-2"
        status={status}
        onChange={onChange}
        pending={pending}
        hideEnabledSwitch
      />
      {error ? (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="telemetry-notice-turn-off"
          disabled={pending}
          onClick={onTurnOff}
        >
          {t('telemetry.notice.turnOff')}
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="telemetry-notice-dismiss"
          disabled={pending}
          onClick={onDismiss}
        >
          {t('telemetry.notice.dismiss')}
        </Button>
      </div>
    </section>
  );
}

function readDismissed(): boolean {
  try {
    return Boolean(window.localStorage.getItem(TELEMETRY_NOTICE_DISMISSED_KEY));
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(TELEMETRY_NOTICE_DISMISSED_KEY, new Date().toISOString());
  } catch {
    // Private mode or blocked storage — the notice simply shows again.
  }
}

export interface TelemetryNoticeCardProps {
  className?: string;
}

/**
 * Shows the notice in web onboarding until acknowledged, with one-click
 * "Turn off". Hidden while telemetry is off (environment or user choice).
 */
export function TelemetryNoticeCard({ className }: TelemetryNoticeCardProps) {
  const { t } = useTranslation('web');
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);
  const [status, setStatus] = useState<TelemetryStatusView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recordedShown = useRef(false);

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    getTelemetryStatus()
      .then((loaded) => {
        if (!cancelled) setStatus(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  const visible = !dismissed && status?.enabled === true;

  useEffect(() => {
    if (!visible || recordedShown.current) return;
    recordedShown.current = true;
    recordOnboardingStep(OnboardingStep.TelemetryNotice, false).catch(() => undefined);
  }, [visible]);

  const apply = useCallback(
    async (change: TelemetryPreferenceChange) => {
      setPending(true);
      setError(null);
      const result = await setTelemetryPreferences(change).catch(() => null);
      setPending(false);
      if (result?.ok && result.status) {
        setStatus(result.status);
        return true;
      }
      setError(t('telemetry.notice.failed'));
      return false;
    },
    [t]
  );

  const acknowledge = useCallback(() => {
    writeDismissed();
    setDismissed(true);
  }, []);

  const handleDismiss = useCallback(() => {
    recordOnboardingStep(OnboardingStep.TelemetryNotice, true).catch(() => undefined);
    acknowledge();
  }, [acknowledge]);

  const handleTurnOff = useCallback(async () => {
    // Turning off also deletes queued events, so this choice is never reported.
    if (await apply({ enabled: false })) acknowledge();
  }, [apply, acknowledge]);

  if (!visible || !status) return null;
  return (
    <TelemetryNoticeCardView
      className={className}
      status={status}
      pending={pending}
      error={error}
      onChange={(change) => void apply(change)}
      onTurnOff={() => void handleTurnOff()}
      onDismiss={handleDismiss}
    />
  );
}
