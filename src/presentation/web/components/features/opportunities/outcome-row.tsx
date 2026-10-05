'use client';

/**
 * OutcomeRow — one shipped opportunity (spec 130): its verdict and the
 * similar reports behind it, the customers still to tell with a note to send,
 * and the review hours it really took.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone } from 'lucide-react';
import { OutcomeVerdict } from '@shepai/core/domain/generated/output';
import type { OutcomeView } from '@shepai/core/application/use-cases/outcomes/manage-outcomes.use-case';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { RunAction } from '@/hooks/use-run-action';
import { recordOutcomeHours, tellCustomers } from '@/app/actions/outcomes';

const VERDICT_VARIANT: Record<OutcomeVerdict, 'secondary' | 'outline' | 'destructive'> = {
  [OutcomeVerdict.Pending]: 'outline',
  [OutcomeVerdict.Solved]: 'secondary',
  [OutcomeVerdict.Persisting]: 'destructive',
};

export interface OutcomeRowProps {
  view: OutcomeView;
  run: RunAction;
}

export function OutcomeRow({ view, run }: OutcomeRowProps) {
  const { t } = useTranslation('web');
  const { outcome, opportunity, customers } = view;
  const [hours, setHours] = useState('');
  const id = opportunity.id;

  async function saveHours(event: FormEvent) {
    event.preventDefault();
    if (await run(() => recordOutcomeHours(id, Number(hours)))) setHours('');
  }

  return (
    <li data-testid={`outcome-${id}`} className="bg-card space-y-1.5 rounded-md border p-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{opportunity.title}</span>
        <Badge variant={VERDICT_VARIANT[outcome.verdict]} className="text-[10px]">
          {t(`opportunities.outcomes.verdict.${outcome.verdict}`)}
        </Badge>
        <span className="text-muted-foreground">
          {outcome.verdict === OutcomeVerdict.Pending
            ? t('opportunities.outcomes.judgedOn', {
                date: new Date(outcome.reviewAt).toLocaleDateString(),
              })
            : t('opportunities.outcomes.counts', {
                before: outcome.signalsBefore ?? 0,
                after: outcome.signalsAfter ?? 0,
              })}
        </span>
        <form onSubmit={saveHours} className="ms-auto flex items-center gap-1">
          {outcome.actualReviewHours === undefined ? null : (
            <span className="text-muted-foreground">
              {t('opportunities.outcomes.hoursTaken', {
                actual: outcome.actualReviewHours,
                estimated: opportunity.reviewHours,
              })}
            </span>
          )}
          <Input
            type="number"
            min={0}
            step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder={t('opportunities.outcomes.hours')}
            aria-label={t('opportunities.outcomes.hours')}
            className="h-7 w-20 text-xs"
            data-testid={`outcome-hours-${id}`}
          />
          <Button
            type="submit"
            size="xs"
            variant="ghost"
            disabled={hours.trim() === ''}
            data-testid={`outcome-hours-save-${id}`}
          >
            {t('opportunities.outcomes.saveHours')}
          </Button>
        </form>
      </div>
      {customers.length > 0 ? (
        <div
          data-testid={`outcome-customers-${id}`}
          className="bg-muted/50 flex flex-wrap items-center gap-1.5 rounded p-1.5"
        >
          <Megaphone className="size-3.5" />
          <span>{t('opportunities.outcomes.note', { title: opportunity.title })}</span>
          {customers.map(({ customer, urls }) =>
            urls[0] ? (
              <a
                key={customer}
                href={urls[0]}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline"
              >
                {customer}
              </a>
            ) : (
              <span key={customer} className="font-medium">
                {customer}
              </span>
            )
          )}
          <Button
            size="xs"
            variant="outline"
            className="ms-auto"
            onClick={() => run(() => tellCustomers(id))}
            data-testid={`outcome-tell-${id}`}
          >
            {t('opportunities.outcomes.markTold')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
