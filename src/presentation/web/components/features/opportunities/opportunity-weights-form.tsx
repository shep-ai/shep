'use client';

/**
 * OpportunityWeightsForm — what the space values and how many review hours
 * it has each week (spec 126). Changing a weight re-ranks the board.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { OpportunityWeights } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { RunAction } from '@/hooks/use-run-action';
import { setOpportunityWeights } from '@/app/actions/manage-opportunities';

type WeightField = Exclude<keyof OpportunityWeights, 'spaceId'>;

const FIELDS: WeightField[] = ['reach', 'revenue', 'urgency', 'strategic', 'weeklyReviewHours'];

export interface OpportunityWeightsFormProps {
  weights: OpportunityWeights;
  run: RunAction;
}

export function OpportunityWeightsForm({ weights, run }: OpportunityWeightsFormProps) {
  const { t } = useTranslation('web');
  const [values, setValues] = useState<Record<WeightField, string>>(
    Object.fromEntries(FIELDS.map((field) => [field, String(weights[field])])) as Record<
      WeightField,
      string
    >
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(() =>
      setOpportunityWeights(
        weights.spaceId,
        Object.fromEntries(FIELDS.map((field) => [field, Number.parseFloat(values[field])]))
      )
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label={t('opportunities.weights.title')}
      className="bg-card space-y-2 rounded-lg border p-3"
    >
      <h2 className="text-xs font-medium">{t('opportunities.weights.title')}</h2>
      <p className="text-muted-foreground text-xs">{t('opportunities.weights.formula')}</p>
      <div className="flex flex-wrap items-end gap-2">
        {FIELDS.map((field) => (
          <label key={field} className="flex flex-col gap-1 text-xs">
            {t(`opportunities.weights.${field}`)}
            <Input
              type="number"
              min={0}
              step="any"
              value={values[field]}
              onChange={(e) => setValues((current) => ({ ...current, [field]: e.target.value }))}
              className="h-7 w-20 text-xs"
              data-testid={`weights-${field}`}
            />
          </label>
        ))}
        <Button type="submit" size="xs" variant="outline" data-testid="weights-submit">
          {t('opportunities.weights.save')}
        </Button>
      </div>
    </form>
  );
}
