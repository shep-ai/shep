'use client';

/**
 * DiscoveryPanel — the discovery agent for this space (spec 128): run it now,
 * see what its last run did, and choose how often the daemon runs it.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { DiscoveryRunStatus, type DiscoveryRun } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import type { RunAction } from '@/hooks/use-run-action';
import { runDiscovery, setDiscoverySchedule } from '@/app/actions/discovery';

/** Schedules offered, in hours. */
const SCHEDULE_HOURS = [6, 24, 168] as const;

export interface DiscoveryPanelProps {
  spaceId: string;
  /** Hours between scheduled runs; unset when discovery is off. */
  everyHours?: number;
  latest?: DiscoveryRun;
  run: RunAction;
}

export function DiscoveryPanel({ spaceId, everyHours, latest, run }: DiscoveryPanelProps) {
  const { t } = useTranslation('web');
  const [discovering, setDiscovering] = useState(false);

  async function discover() {
    setDiscovering(true);
    try {
      await run(() => runDiscovery(spaceId));
    } finally {
      setDiscovering(false);
    }
  }

  let last: string;
  if (!latest) last = t('opportunities.discovery.never');
  else if (latest.status === DiscoveryRunStatus.Running)
    last = t('opportunities.discovery.running');
  else if (latest.status === DiscoveryRunStatus.Failed)
    last = t('opportunities.discovery.failed', { error: latest.error ?? '' });
  else
    last = t('opportunities.discovery.succeeded', {
      proposed: latest.proposed,
      read: latest.signalsRead,
      when: new Date(latest.finishedAt ?? latest.createdAt).toLocaleString(),
    });

  return (
    <section
      data-testid="discovery-panel"
      className="bg-card flex flex-wrap items-center gap-2 rounded-lg border p-3 text-xs"
    >
      <Sparkles className="size-4" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t('opportunities.discovery.title')}</p>
        <p
          className={
            latest?.status === DiscoveryRunStatus.Failed
              ? 'text-destructive'
              : 'text-muted-foreground'
          }
        >
          {last}
        </p>
      </div>
      <label className="flex items-center gap-1">
        {t('opportunities.discovery.schedule')}
        <select
          value={everyHours === undefined ? '' : String(everyHours)}
          onChange={(e) =>
            run(() => setDiscoverySchedule(spaceId, e.target.value ? Number(e.target.value) : null))
          }
          className={`${NATIVE_SELECT_CLASS} h-7`}
          data-testid="discovery-schedule"
        >
          <option value="">{t('opportunities.discovery.off')}</option>
          {everyHours !== undefined &&
          !(SCHEDULE_HOURS as readonly number[]).includes(everyHours) ? (
            <option value={String(everyHours)}>
              {t('opportunities.discovery.everyHours', { hours: everyHours })}
            </option>
          ) : null}
          {SCHEDULE_HOURS.map((hours) => (
            <option key={hours} value={String(hours)}>
              {t('opportunities.discovery.everyHours', { hours })}
            </option>
          ))}
        </select>
      </label>
      <Button
        size="xs"
        variant="outline"
        disabled={discovering || latest?.status === DiscoveryRunStatus.Running}
        onClick={discover}
        data-testid="discovery-run"
      >
        <Sparkles className={discovering ? 'animate-pulse' : undefined} />
        {t(discovering ? 'opportunities.discovery.discovering' : 'opportunities.discovery.run')}
      </Button>
    </section>
  );
}
