'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarnessSessionDetail } from '@shepai/core/application/use-cases/harness/get-harness-session.use-case';
import { getHarnessSessionForFeature } from '@/app/actions/harness-queries';
import { useHarnessLive } from '@/hooks/use-harness-live';
import { HarnessSessionView } from './harness-session-view';

export interface HarnessContextTabProps {
  featureId: string;
}

/**
 * Feature drawer → Context (spec 119, F3): per-phase summary, turns, and what
 * the model saw on each turn, for features that run on the Shep Harness.
 */
export function HarnessContextTab({ featureId }: HarnessContextTabProps) {
  const { t } = useTranslation('web');
  const [detail, setDetail] = useState<HarnessSessionDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    void getHarnessSessionForFeature(featureId).then((r) => {
      if (r.ok) setDetail(r.data);
      else setError(r.error);
    });
  }, [featureId]);
  useEffect(load, [load]);
  useHarnessLive(detail?.session.id ?? null, load);

  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (detail === undefined)
    return <p className="text-muted-foreground text-xs">{t('harness.loading')}</p>;
  if (detail === null) {
    return (
      <p className="text-muted-foreground text-xs" data-testid="harness-context-empty">
        {t('harness.context.empty')}
      </p>
    );
  }
  return <HarnessSessionView detail={detail} onChanged={load} />;
}
