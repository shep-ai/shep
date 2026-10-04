'use client';

/**
 * CapacityBar — how much of the space's weekly review capacity the line uses
 * (spec 126): building work and accepted bets that fit.
 */

import { useTranslation } from 'react-i18next';

const FULL = 100;

export interface CapacityBarProps {
  usedHours: number;
  capacityHours: number;
  /** Accepted opportunities that did not fit. */
  waiting: number;
}

export function CapacityBar({ usedHours, capacityHours, waiting }: CapacityBarProps) {
  const { t } = useTranslation('web');
  const percent = capacityHours > 0 ? Math.min(FULL, (usedHours / capacityHours) * FULL) : FULL;
  return (
    <div data-testid="capacity-bar" className="bg-card space-y-1.5 rounded-lg border p-3">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{t('opportunities.capacity.title')}</span>
        <span className="text-muted-foreground">
          {t('opportunities.capacity.used', { used: usedHours, capacity: capacityHours })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={capacityHours}
        aria-valuenow={usedHours}
        aria-label={t('opportunities.capacity.title')}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div className="bg-primary h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
      {waiting > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t('opportunities.capacity.waiting', { count: waiting })}
        </p>
      ) : null}
    </div>
  );
}
