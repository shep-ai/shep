'use client';

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitCheckpoint } from '@shepai/core/domain/generated/output';
import { checkpointLabel } from '@shepai/core/domain/shared/git-checkpoint';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';

export interface CheckpointCompareBarProps {
  checkpoints: GitCheckpoint[];
  /** Label of the "from" checkpoint. */
  from: string;
  /** Label of the "to" checkpoint. */
  to: string;
  onFromChange: (label: string) => void;
  onToChange: (label: string) => void;
}

/** Pick any two checkpoints to compare. */
export function CheckpointCompareBar({
  checkpoints,
  from,
  to,
  onFromChange,
  onToChange,
}: CheckpointCompareBarProps) {
  const { t } = useTranslation('web');
  const fromId = useId();
  const toId = useId();
  const options = checkpoints.map((c) => {
    const label = checkpointLabel(c);
    return (
      <option key={c.id} value={label}>
        {label}
      </option>
    );
  });
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs" data-testid="checkpoint-compare-bar">
      <label htmlFor={fromId} className="text-muted-foreground">
        {t('checkpoints.from')}
      </label>
      <select
        id={fromId}
        className={NATIVE_SELECT_CLASS}
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
      >
        {options}
      </select>
      <label htmlFor={toId} className="text-muted-foreground">
        {t('checkpoints.to')}
      </label>
      <select
        id={toId}
        className={NATIVE_SELECT_CLASS}
        value={to}
        onChange={(e) => onToChange(e.target.value)}
      >
        {options}
      </select>
    </div>
  );
}
