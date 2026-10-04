'use client';

/**
 * AddOpportunityForm — shape a bet in the board's space (spec 126): a name,
 * the review hours it will cost, how confident the team is, and whether it is
 * strategic.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import type { RunAction } from '@/hooks/use-run-action';
import { createOpportunity } from '@/app/actions/manage-opportunities';

const DEFAULT_HOURS = '4';
const DEFAULT_CONFIDENCE = '50';
const PERCENT = 100;

export interface AddOpportunityFormProps {
  spaceId: string;
  productLines: { id: string; name: string }[];
  run: RunAction;
}

export function AddOpportunityForm({ spaceId, productLines, run }: AddOpportunityFormProps) {
  const { t } = useTranslation('web');
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [confidence, setConfidence] = useState(DEFAULT_CONFIDENCE);
  const [productLine, setProductLine] = useState('');
  const [strategic, setStrategic] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const added = await run(() =>
      createOpportunity({
        space: spaceId,
        title,
        reviewHours: Number.parseFloat(hours),
        confidence: Number.parseFloat(confidence) / PERCENT,
        strategic,
        ...(productLine ? { productLine } : {}),
      })
    );
    if (added) {
      setTitle('');
      setHours(DEFAULT_HOURS);
      setConfidence(DEFAULT_CONFIDENCE);
      setProductLine('');
      setStrategic(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label={t('opportunities.opportunityForm.title')}
      className="flex flex-wrap items-center gap-1.5"
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('opportunities.opportunityForm.placeholder')}
        aria-label={t('opportunities.opportunityForm.name')}
        className="h-7 min-w-48 flex-1 text-xs"
        data-testid="add-opportunity-title"
      />
      <label className="flex items-center gap-1 text-xs">
        <Input
          type="number"
          min={0.5}
          step={0.5}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="h-7 w-16 text-xs"
          data-testid="add-opportunity-hours"
        />
        {t('opportunities.opportunityForm.hours')}
      </label>
      <label className="flex items-center gap-1 text-xs">
        <Input
          type="number"
          min={0}
          max={PERCENT}
          value={confidence}
          onChange={(e) => setConfidence(e.target.value)}
          className="h-7 w-16 text-xs"
          data-testid="add-opportunity-confidence"
        />
        {t('opportunities.opportunityForm.confidence')}
      </label>
      {productLines.length > 0 ? (
        <select
          value={productLine}
          onChange={(e) => setProductLine(e.target.value)}
          aria-label={t('opportunities.opportunityForm.productLine')}
          className={`${NATIVE_SELECT_CLASS} h-7`}
          data-testid="add-opportunity-product-line"
        >
          <option value="">{t('opportunities.opportunityForm.anyLine')}</option>
          {productLines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.name}
            </option>
          ))}
        </select>
      ) : null}
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={strategic}
          onChange={(e) => setStrategic(e.target.checked)}
          data-testid="add-opportunity-strategic"
        />
        {t('opportunities.opportunityForm.strategic')}
      </label>
      <Button
        type="submit"
        size="xs"
        variant="outline"
        disabled={!title.trim()}
        data-testid="add-opportunity-submit"
      >
        <Plus />
        {t('opportunities.opportunityForm.submit')}
      </Button>
    </form>
  );
}
