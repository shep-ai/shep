'use client';

/**
 * The feature-flags view (spec 133): every flag Shep has, what it turns on,
 * its default and a switch. Changes save immediately.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Check, Flag } from 'lucide-react';
import type { FeatureFlagState } from '@shepai/core/application/use-cases/settings/list-feature-flags.use-case';
import type { FeatureFlagKey } from '@shepai/core/domain/shared/feature-flag-catalog';
import { setFeatureFlag } from '@/app/actions/set-feature-flag';
import { FeatureFlagsList } from '@/components/features/settings/feature-flags-list';

export interface FeatureFlagsPageClientProps {
  initialFlags: FeatureFlagState[];
}

export function FeatureFlagsPageClient({ initialFlags }: FeatureFlagsPageClientProps) {
  const { t } = useTranslation('web');
  const [flags, setFlags] = useState(initialFlags);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const setEnabled = (key: FeatureFlagKey, enabled: boolean) =>
    setFlags((current) => current.map((flag) => (flag.key === key ? { ...flag, enabled } : flag)));

  const toggle = (key: FeatureFlagKey, enabled: boolean) => {
    setEnabled(key, enabled);
    setSaved(false);
    startTransition(async () => {
      const result = await setFeatureFlag(key, enabled);
      if (result.ok) {
        setSaved(true);
        return;
      }
      setEnabled(key, !enabled);
      toast.error(result.error ?? t('settings.failedToSave'));
    });
  };

  const onCount = flags.filter((flag) => flag.enabled).length;

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6"
      data-testid="feature-flags-page"
    >
      <Link
        href="/settings"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs"
      >
        <ArrowLeft className="size-3" aria-hidden="true" />
        {t('settings.featureFlags.backToSettings')}
      </Link>
      <header className="flex flex-wrap items-center gap-2">
        <Flag className="text-muted-foreground size-4" aria-hidden="true" />
        <h1 className="text-sm font-bold tracking-tight">{t('settings.featureFlags.title')}</h1>
        <span
          role="status"
          aria-live="polite"
          className="text-muted-foreground flex h-5 min-w-16 items-center gap-1 text-xs"
        >
          {pending ? (
            t('settings.saving')
          ) : saved ? (
            <>
              <Check className="size-3 text-green-700 dark:text-green-400" aria-hidden="true" />
              {t('settings.saved')}
            </>
          ) : null}
        </span>
        <span className="text-muted-foreground ml-auto text-xs" data-testid="feature-flags-count">
          {t('settings.featureFlags.onCount', { on: onCount, total: flags.length })}
        </span>
      </header>
      <p className="text-muted-foreground text-xs">{t('settings.featureFlags.pageDescription')}</p>
      <div className="bg-background rounded-lg border px-4 py-2">
        <FeatureFlagsList items={flags} onToggle={toggle} />
      </div>
    </div>
  );
}
