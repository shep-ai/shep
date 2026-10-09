'use client';

/**
 * FactoryPageClient — the Factory page (spec 132): one space's software
 * factory at a glance, its autopilot policy and its recent passes.
 *
 * Thin presentation: each change is one server action backed by a use case;
 * after a success the page refreshes.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { useTranslation } from 'react-i18next';
import { Factory } from 'lucide-react';
import type { AutopilotRun } from '@shepai/core/domain/generated/output';
import type { FactoryStatus } from '@shepai/core/application/use-cases/autopilot/get-factory-status.use-case';
import { useRunAction } from '@/hooks/use-run-action';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import { FactoryStatusCards } from './factory-status-cards';
import { AutopilotForm } from './autopilot-form';
import { AutopilotRuns } from './autopilot-runs';
import type { FactoryProject, FactorySpaceOption } from './factory-types';

export interface FactoryPageClientProps {
  spaces: FactorySpaceOption[];
  status?: FactoryStatus;
  runs: AutopilotRun[];
  projects: FactoryProject[];
  /** Set when the page could not be loaded. */
  loadError?: string;
}

export function FactoryPageClient({
  spaces,
  status,
  runs,
  projects,
  loadError,
}: FactoryPageClientProps) {
  const { t } = useTranslation('web');
  // The autopilot policy and passes have their own flag (spec 135).
  const flags = useFeatureFlags();
  const { run, error } = useRunAction({
    fallbackError: t('factory.errors.actionFailed'),
    ...(loadError ? { initialError: loadError } : {}),
  });

  return (
    <div data-testid="factory-page" className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Factory className="size-5" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{t('factory.title')}</h1>
          <p className="text-muted-foreground text-xs">{t('factory.subtitle')}</p>
        </div>
        <nav aria-label={t('factory.space')} className="flex flex-wrap gap-1">
          {spaces.map((option) => (
            <Link
              key={option.id}
              href={`/factory?space=${option.slug}` as Route}
              aria-current={option.id === status?.space.id ? 'page' : undefined}
              className={
                option.id === status?.space.id
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
        <p role="alert" data-testid="factory-error" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      {status ? (
        <>
          <FactoryStatusCards status={status} />
          {flags.autopilot ? (
            <>
              <AutopilotForm
                key={JSON.stringify(status.autopilot.policy)}
                space={status.space.id}
                policy={status.autopilot.policy}
                projects={projects}
                run={run}
              />
              <section className="space-y-1.5">
                <h2 className="text-sm font-medium">{t('factory.runs.title')}</h2>
                <AutopilotRuns runs={runs} />
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
