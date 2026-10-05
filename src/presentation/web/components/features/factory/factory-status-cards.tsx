'use client';

/**
 * FactoryStatusCards — one space's factory at a glance (spec 132): the line,
 * what is building, incidents and actions waiting for approval, outcomes and
 * customers to tell. Each card opens the page behind it.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { useTranslation } from 'react-i18next';
import type { FactoryStatus } from '@shepai/core/application/use-cases/autopilot/get-factory-status.use-case';

interface Card {
  key: string;
  labelKey: string;
  value: string;
  page: 'opportunities' | 'incidents';
  /** Highlight when it waits on people. */
  attention: boolean;
}

export function FactoryStatusCards({ status }: { status: FactoryStatus }) {
  const { t } = useTranslation('web');
  const cards: Card[] = [
    {
      key: 'line',
      labelKey: 'factory.cards.line',
      value: `${status.line.usedHours}/${status.line.capacityHours}`,
      page: 'opportunities',
      attention: false,
    },
    {
      key: 'building',
      labelKey: 'factory.cards.building',
      value: String(status.building),
      page: 'opportunities',
      attention: false,
    },
    {
      key: 'incidents',
      labelKey: 'factory.cards.incidents',
      value: String(status.openIncidents),
      page: 'incidents',
      attention: status.openIncidents > 0,
    },
    {
      key: 'actions',
      labelKey: 'factory.cards.actions',
      value: String(status.actionsAwaitingApproval),
      page: 'incidents',
      attention: status.actionsAwaitingApproval > 0,
    },
    {
      key: 'outcomes',
      labelKey: 'factory.cards.outcomes',
      value: String(status.pendingOutcomes),
      page: 'opportunities',
      attention: false,
    },
    {
      key: 'customers',
      labelKey: 'factory.cards.customers',
      value: String(status.customersToTell),
      page: 'opportunities',
      attention: status.customersToTell > 0,
    },
  ];
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <li key={card.key}>
          <Link
            href={`/${card.page}?space=${status.space.slug}` as Route}
            className={`bg-card hover:bg-muted/50 flex flex-col gap-1 rounded-lg border p-3 ${
              card.attention ? 'border-amber-500/60' : ''
            }`}
          >
            <span className="text-muted-foreground text-[11px]">{t(card.labelKey)}</span>
            <span data-testid={`factory-${card.key}`} className="text-lg font-semibold">
              {card.value}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
