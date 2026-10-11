'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getTelemetryStatus,
  setTelemetryPreferences,
  type TelemetryStatusView,
} from '@/app/actions/telemetry';
import { TelemetryPreferences, type TelemetryPreferenceChange } from './telemetry-preferences';
import { TelemetryFieldsList } from './telemetry-fields-list';

export interface TelemetrySettingsSectionProps {
  className?: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; status: TelemetryStatusView };

/** The usage-metrics block of the Settings page (spec 133). */
export function TelemetrySettingsSection({ className }: TelemetrySettingsSectionProps) {
  const { t } = useTranslation('web');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTelemetryStatus()
      .then((status) => {
        if (!cancelled) setState(status ? { kind: 'ready', status } : { kind: 'failed' });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback(
    async (change: TelemetryPreferenceChange) => {
      setPending(true);
      setError(null);
      const result = await setTelemetryPreferences(change).catch(() => null);
      setPending(false);
      if (result?.ok && result.status) {
        setState({ kind: 'ready', status: result.status });
      } else {
        setError(t('telemetry.notice.failed'));
      }
    },
    [t]
  );

  if (state.kind === 'loading') {
    return (
      <div
        data-testid="telemetry-settings-section"
        role="status"
        className={cn('text-muted-foreground flex items-center gap-2 py-3 text-xs', className)}
      >
        <Loader2 aria-hidden="true" className="size-3 animate-spin" />
        {t('telemetry.settings.loading')}
      </div>
    );
  }
  if (state.kind === 'failed') {
    return (
      <p
        data-testid="telemetry-settings-section"
        role="alert"
        className={cn('text-destructive py-3 text-xs', className)}
      >
        {t('telemetry.settings.loadFailed')}
      </p>
    );
  }

  const { status } = state;
  return (
    <div data-testid="telemetry-settings-section" className={cn('min-w-0', className)}>
      <TelemetryPreferences status={status} onChange={handleChange} pending={pending} />
      {error ? (
        <p role="alert" className="text-destructive py-2 text-xs">
          {error}
        </p>
      ) : null}
      <div className="text-muted-foreground space-y-0.5 border-b py-2.5 text-xs tabular-nums">
        <p data-testid="telemetry-settings-queued">
          {t('telemetry.settings.queued', { count: status.queuedEvents })}
        </p>
        <p data-testid="telemetry-settings-destination">
          {status.configured
            ? t('telemetry.settings.destination', { destination: status.destination })
            : t('telemetry.settings.notConfigured')}
        </p>
      </div>
      <TelemetryFieldsList className="py-2.5" />
    </div>
  );
}
