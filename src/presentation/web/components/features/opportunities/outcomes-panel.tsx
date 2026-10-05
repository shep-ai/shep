'use client';

/**
 * OutcomesPanel — what happened after the space's opportunities shipped
 * (spec 130): each one's verdict, the customers to tell, and how the space's
 * review-hour estimates and bets have held up.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Rocket } from 'lucide-react';
import type { OutcomeView } from '@shepai/core/application/use-cases/outcomes/manage-outcomes.use-case';
import type { OutcomeCalibration } from '@shepai/core/domain/shared/outcomes';
import { Button } from '@/components/ui/button';
import type { RunAction } from '@/hooks/use-run-action';
import { checkOutcomes } from '@/app/actions/outcomes';
import { OutcomeRow } from './outcome-row';

export interface OutcomesPanelProps {
  outcomes: OutcomeView[];
  calibration: OutcomeCalibration;
  run: RunAction;
}

export function OutcomesPanel({ outcomes, calibration, run }: OutcomesPanelProps) {
  const { t } = useTranslation('web');
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      await run(checkOutcomes);
    } finally {
      setChecking(false);
    }
  }

  const parts = [
    calibration.hoursRatio === undefined
      ? t('opportunities.outcomes.noHours')
      : t('opportunities.outcomes.hoursRatio', {
          ratio: calibration.hoursRatio,
          timed: calibration.timed,
        }),
    calibration.judged === 0
      ? t('opportunities.outcomes.noVerdicts')
      : t('opportunities.outcomes.solvedShare', {
          solved: calibration.solved,
          judged: calibration.judged,
        }),
  ];

  return (
    <section data-testid="outcomes-panel" className="space-y-2">
      <header className="flex flex-wrap items-center gap-2">
        <Rocket className="size-4" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">{t('opportunities.outcomes.title')}</h2>
          <p data-testid="outcomes-calibration" className="text-muted-foreground text-xs">
            {parts.join(' · ')}
          </p>
        </div>
        <Button
          size="xs"
          variant="outline"
          disabled={checking}
          onClick={check}
          data-testid="outcomes-check"
        >
          <RefreshCw className={checking ? 'animate-spin' : undefined} />
          {t('opportunities.outcomes.check')}
        </Button>
      </header>
      {outcomes.length === 0 ? (
        <p data-testid="outcomes-empty" className="text-muted-foreground text-xs">
          {t('opportunities.outcomes.empty')}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {outcomes.map((view) => (
            <OutcomeRow key={view.outcome.id} view={view} run={run} />
          ))}
        </ul>
      )}
    </section>
  );
}
