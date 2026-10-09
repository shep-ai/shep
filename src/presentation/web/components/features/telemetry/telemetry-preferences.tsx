'use client';

import { useTranslation } from 'react-i18next';
import { TelemetryDisabledReason } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import type { TelemetryStatusView } from '@/app/actions/telemetry';
import { SwitchRow } from '../settings/settings-rows';

export interface TelemetryPreferenceChange {
  enabled?: boolean;
  includeIdentity?: boolean;
  contactConsent?: boolean;
}

export interface TelemetryPreferencesProps {
  status: TelemetryStatusView;
  onChange: (change: TelemetryPreferenceChange) => void;
  /** Disables the switches while a change is being saved. */
  pending?: boolean;
  /** Hide the main on/off switch (the onboarding card has its own "Turn off"). */
  hideEnabledSwitch?: boolean;
  className?: string;
}

/** The usage-metrics switches (spec 133): metrics on/off, identity, contact consent. */
export function TelemetryPreferences({
  status,
  onChange,
  pending = false,
  hideEnabledSwitch = false,
  className,
}: TelemetryPreferencesProps) {
  const { t } = useTranslation('web');
  const forcedOff = !status.enabled && status.reason !== TelemetryDisabledReason.UserOptOut;

  return (
    <div data-testid="telemetry-preferences" className={cn('min-w-0', className)}>
      {forcedOff && status.reason ? (
        <p
          data-testid="telemetry-preferences-forced-off"
          className="text-muted-foreground py-2 text-xs"
        >
          {t('telemetry.settings.forcedOff', { reason: t(`telemetry.reasons.${status.reason}`) })}
        </p>
      ) : null}
      {hideEnabledSwitch ? null : (
        <SwitchRow
          label={t('telemetry.controls.enabled')}
          description={t('telemetry.controls.enabledDescription')}
          id="telemetry-enabled"
          testId="switch-telemetry-enabled"
          checked={status.enabled}
          disabled={pending || forcedOff}
          onChange={(enabled) => onChange({ enabled })}
        />
      )}
      <SwitchRow
        label={t('telemetry.controls.identity')}
        description={t('telemetry.controls.identityDescription')}
        id="telemetry-identity"
        testId="switch-telemetry-identity"
        checked={status.includeIdentity}
        disabled={pending || !status.enabled}
        onChange={(includeIdentity) => onChange({ includeIdentity })}
      />
      <SwitchRow
        label={t('telemetry.controls.contact')}
        description={t('telemetry.controls.contactDescription')}
        id="telemetry-contact"
        testId="switch-telemetry-contact"
        checked={status.contactConsent}
        disabled={pending || !status.enabled}
        onChange={(contactConsent) => onChange({ contactConsent })}
      />
    </div>
  );
}
