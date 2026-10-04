'use client';

/**
 * AddSignalForm — record a signal in the board's space (spec 126): what was
 * asked or broke, who asked, how much revenue is at stake, and whether it is
 * urgent.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { SignalKind } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import type { RunAction } from '@/hooks/use-run-action';
import { recordSignal } from '@/app/actions/manage-opportunities';

export interface AddSignalFormProps {
  spaceId: string;
  run: RunAction;
}

export function AddSignalForm({ spaceId, run }: AddSignalFormProps) {
  const { t } = useTranslation('web');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<SignalKind>(SignalKind.Feedback);
  const [customer, setCustomer] = useState('');
  const [revenue, setRevenue] = useState('');
  const [urgent, setUrgent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const added = await run(() =>
      recordSignal({
        space: spaceId,
        title,
        kind,
        ...(customer.trim() ? { customer } : {}),
        ...(revenue.trim() ? { monthlyRevenue: Number.parseFloat(revenue) } : {}),
        urgent,
      })
    );
    if (added) {
      setTitle('');
      setCustomer('');
      setRevenue('');
      setUrgent(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label={t('opportunities.signalForm.title')}
      className="flex flex-wrap items-center gap-1.5"
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('opportunities.signalForm.placeholder')}
        aria-label={t('opportunities.signalForm.signal')}
        className="h-7 min-w-48 flex-1 text-xs"
        data-testid="add-signal-title"
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as SignalKind)}
        aria-label={t('opportunities.signalForm.kind')}
        className={`${NATIVE_SELECT_CLASS} h-7`}
        data-testid="add-signal-kind"
      >
        {Object.values(SignalKind).map((option) => (
          <option key={option} value={option}>
            {t(`opportunities.kind.${option}`)}
          </option>
        ))}
      </select>
      <Input
        value={customer}
        onChange={(e) => setCustomer(e.target.value)}
        placeholder={t('opportunities.signalForm.customer')}
        aria-label={t('opportunities.signalForm.customer')}
        className="h-7 w-32 text-xs"
        data-testid="add-signal-customer"
      />
      <Input
        type="number"
        min={0}
        value={revenue}
        onChange={(e) => setRevenue(e.target.value)}
        placeholder={t('opportunities.signalForm.revenue')}
        aria-label={t('opportunities.signalForm.revenue')}
        className="h-7 w-28 text-xs"
        data-testid="add-signal-revenue"
      />
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
          data-testid="add-signal-urgent"
        />
        {t('opportunities.signalForm.urgent')}
      </label>
      <Button
        type="submit"
        size="xs"
        variant="outline"
        disabled={!title.trim()}
        data-testid="add-signal-submit"
      >
        <Plus />
        {t('opportunities.signalForm.submit')}
      </Button>
    </form>
  );
}
