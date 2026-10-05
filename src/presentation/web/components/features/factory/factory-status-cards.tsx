'use client';

/**
 * FactoryStatusCards — one space's factory at a glance (spec 132): the line,
 * what is building, features in flight and those waiting for approval,
 * incidents and actions waiting for approval, outcomes and customers to
 * tell. Each card opens the page behind it.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { useTranslation } from 'react-i18next';
import type { FactoryStatus } from '@shepai/core/application/use-cases/autopilot/get-factory-status.use-case';

interface Card {
  key: string;
  labelKey: string;
  value: string;
  /** The page behind the card; Control Center shows features. */
  href: string;
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
      href: `/opportunities?space=${status.space.slug}`,
      attention: false,
    },
    {
      key: 'building',
      labelKey: 'factory.cards.building',
      value: String(status.building),
      href: `/opportunities?space=${status.space.slug}`,
      attention: false,
    },
    {
      key: 'features',
      labelKey: 'factory.cards.features',
      value: String(status.features.inFlight),
      href: '/',
      attention: false,
    },
    {
      key: 'approval',
      labelKey: 'factory.cards.approval',
      value: String(status.features.awaitingApproval),
      href: '/',
      attention: status.features.awaitingApproval > 0,
    },
    {
      key: 'incidents',
      labelKey: 'factory.cards.incidents',
      value: String(status.openIncidents),
      href: `/incidents?space=${status.space.slug}`,
      attention: status.openIncidents > 0,
    },
    {
      key: 'actions',
      labelKey: 'factory.cards.actions',
      value: String(status.actionsAwaitingApproval),
      href: `/incidents?space=${status.space.slug}`,
      attention: status.actionsAwaitingApproval > 0,
    },
    {
      key: 'outcomes',
      labelKey: 'factory.cards.outcomes',
      value: String(status.pendingOutcomes),
      href: `/opportunities?space=${status.space.slug}`,
      attention: false,
    },
    {
      key: 'customers',
      labelKey: 'factory.cards.customers',
      value: String(status.customersToTell),
      href: `/opportunities?space=${status.space.slug}`,
      attention: status.customersToTell > 0,
    },
  ];
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {cards.map((card) => (
        <li key={card.key}>
          <Link
            href={card.href as Route}
            className={`bg-card hover:bg-muted/50 flex h-full flex-col justify-between gap-1 rounded-lg border p-3 ${
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
