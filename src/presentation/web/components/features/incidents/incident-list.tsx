'use client';

/**
 * IncidentList — a space's incidents, newest first (spec 129). Each row links
 * to the incident on this page; the selected one is marked.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { useTranslation } from 'react-i18next';
import type { Incident } from '@shepai/core/domain/generated/output';
import { IncidentStatusBadge, SeverityBadge } from './incident-badges';

export interface IncidentListProps {
  incidents: Incident[];
  selectedId?: string;
  /** Slug of the space the page shows. */
  spaceSlug: string;
}

export function IncidentList({ incidents, selectedId, spaceSlug }: IncidentListProps) {
  const { t } = useTranslation('web');
  if (incidents.length === 0) {
    return (
      <p data-testid="incidents-empty" className="text-muted-foreground py-6 text-center text-sm">
        {t('incidents.empty')}
      </p>
    );
  }
  return (
    <ul aria-label={t('incidents.list')} className="space-y-1">
      {incidents.map((incident) => {
        const selected = incident.id === selectedId;
        return (
          <li key={incident.id}>
            <Link
              href={`/incidents?space=${spaceSlug}&incident=${incident.id}` as Route}
              aria-current={selected ? 'page' : undefined}
              data-testid={`incident-row-${incident.id}`}
              className={`flex flex-col gap-1 rounded-md border p-2 text-xs ${
                selected ? 'border-primary bg-card' : 'bg-card/60 hover:bg-card'
              }`}
            >
              <span className="font-medium">{incident.title}</span>
              <span className="flex flex-wrap items-center gap-1">
                <SeverityBadge severity={incident.severity} />
                <IncidentStatusBadge status={incident.status} />
                {incident.runtimeWorkload ? (
                  <span className="text-muted-foreground font-mono">
                    {incident.runtimeNamespace}/{incident.runtimeWorkload}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
