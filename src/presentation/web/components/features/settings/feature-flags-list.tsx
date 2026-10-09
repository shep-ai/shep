'use client';

/**
 * Every feature flag as a switch, grouped by section (spec 135). Used by the
 * Feature Flags section of the Settings page and by /settings/feature-flags.
 * The list and its order come from the domain catalog, so a new flag shows up
 * here without touching this component.
 */

import { useTranslation } from 'react-i18next';
import { FeatureFlagGroup } from '@shepai/core/domain/generated/output';
import type { FeatureFlagKey } from '@shepai/core/domain/shared/feature-flag-catalog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { SettingsRow } from './settings-rows';

export interface FeatureFlagListItem {
  key: FeatureFlagKey;
  group: FeatureFlagGroup;
  enabled: boolean;
  /** Shown as a "default on/off" badge when given. */
  defaultEnabled?: boolean;
}

export interface FeatureFlagsListProps {
  items: readonly FeatureFlagListItem[];
  onToggle: (key: FeatureFlagKey, enabled: boolean) => void;
  disabled?: boolean;
}

const GROUP_TITLE_KEYS: Record<FeatureFlagGroup, string> = {
  [FeatureFlagGroup.Platform]: 'settings.featureFlags.groupPlatform',
  [FeatureFlagGroup.SoftwareFactory]: 'settings.featureFlags.groupSoftwareFactory',
  [FeatureFlagGroup.Experimental]: 'settings.featureFlags.groupExperimental',
};

export function FeatureFlagsList({ items, onToggle, disabled = false }: FeatureFlagsListProps) {
  const { t } = useTranslation('web');
  return (
    <div className="flex flex-col gap-3" data-testid="feature-flags-list">
      {Object.values(FeatureFlagGroup).map((group) => {
        const inGroup = items.filter((item) => item.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} aria-labelledby={`feature-flags-group-${group}`}>
            <h3
              id={`feature-flags-group-${group}`}
              className="text-muted-foreground pt-1 text-[11px] font-semibold tracking-wide uppercase"
            >
              {t(GROUP_TITLE_KEYS[group])}
            </h3>
            {inGroup.map((item) => (
              <SettingsRow
                key={item.key}
                label={t(`settings.featureFlags.${item.key}`)}
                description={t(`settings.featureFlags.${item.key}Description`)}
                htmlFor={`flag-${item.key}`}
              >
                {item.defaultEnabled === undefined ? null : (
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    data-testid={`flag-default-${item.key}`}
                  >
                    {item.defaultEnabled
                      ? t('settings.featureFlags.defaultOn')
                      : t('settings.featureFlags.defaultOff')}
                  </Badge>
                )}
                <Switch
                  id={`flag-${item.key}`}
                  data-testid={`switch-flag-${item.key}`}
                  checked={item.enabled}
                  onCheckedChange={(enabled) => onToggle(item.key, enabled)}
                  disabled={disabled}
                  className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
              </SettingsRow>
            ))}
          </section>
        );
      })}
    </div>
  );
}
