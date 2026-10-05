'use client';

/** AutopilotRuns — a space's recent autopilot passes (spec 132), newest first. */

import { useTranslation } from 'react-i18next';
import type { AutopilotRun } from '@shepai/core/domain/generated/output';

export function AutopilotRuns({ runs }: { runs: AutopilotRun[] }) {
  const { t } = useTranslation('web');
  if (runs.length === 0) {
    return <p className="text-muted-foreground text-xs">{t('factory.runs.none')}</p>;
  }
  const list = (items: string[]) => (items.length > 0 ? items.join(', ') : '-');
  return (
    <ul aria-label={t('factory.runs.title')} className="space-y-1 text-xs">
      {runs.map((run) => (
        <li key={run.id} data-testid={`autopilot-run-${run.id}`} className="space-y-0.5">
          <p>
            <span className="text-muted-foreground font-mono text-[11px]">
              {new Date(run.createdAt).toLocaleString()}
            </span>{' '}
            {t('factory.runs.pass', {
              investigated: list(run.investigated),
              fixed: list(run.fixed),
              built: list(run.built),
            })}
          </p>
          {run.errors.map((error) => (
            <p key={error} className="text-destructive ps-4">
              {error}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}
