'use client';

/**
 * IncidentsPageClient — the Incidents page (spec 129): a space's incidents
 * and the selected one with its triage, runtime actions, timeline and
 * postmortem, plus a form to open one by hand. Alerts open them too, through
 * `POST /api/alerts`.
 *
 * Thin presentation: each change is one server action backed by a use case;
 * after a success the page refreshes to re-read the incidents.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { useTranslation } from 'react-i18next';
import { Siren } from 'lucide-react';
import type { Incident } from '@shepai/core/domain/generated/output';
import type { IncidentDetail as Detail } from '@shepai/core/application/use-cases/incidents/manage-incidents.use-case';
import { useRunAction } from '@/hooks/use-run-action';
import { IncidentList } from './incident-list';
import { IncidentDetail } from './incident-detail';
import { OpenIncidentForm } from './open-incident-form';
import type { IncidentSpaceOption } from './incidents-types';

export interface IncidentsPageClientProps {
  spaces: IncidentSpaceOption[];
  /** The space shown; unset when it could not be loaded. */
  space?: IncidentSpaceOption;
  incidents?: Incident[];
  selected?: Detail;
  /** Set when the page could not be loaded. */
  loadError?: string;
}

export function IncidentsPageClient({
  spaces,
  space,
  incidents = [],
  selected,
  loadError,
}: IncidentsPageClientProps) {
  const { t } = useTranslation('web');
  const { run, error } = useRunAction({
    fallbackError: t('incidents.errors.actionFailed'),
    ...(loadError ? { initialError: loadError } : {}),
  });

  return (
    <div data-testid="incidents-page" className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Siren className="size-5" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{t('incidents.title')}</h1>
          <p className="text-muted-foreground text-xs">{t('incidents.subtitle')}</p>
        </div>
        <nav aria-label={t('incidents.space')} className="flex flex-wrap gap-1">
          {spaces.map((option) => (
            <Link
              key={option.id}
              href={`/incidents?space=${option.slug}` as Route}
              aria-current={option.id === space?.id ? 'page' : undefined}
              className={
                option.id === space?.id
                  ? 'bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs'
                  : 'hover:bg-muted rounded-md px-2 py-1 text-xs'
              }
            >
              {option.name}
            </Link>
          ))}
        </nav>
      </header>

      {error ? (
        <p role="alert" data-testid="incidents-error" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      {space ? (
        <>
          <OpenIncidentForm spaceId={space.id} run={run} />
          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <IncidentList
              incidents={incidents}
              spaceSlug={space.slug}
              {...(selected ? { selectedId: selected.incident.id } : {})}
            />
            {selected ? <IncidentDetail detail={selected} run={run} /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
