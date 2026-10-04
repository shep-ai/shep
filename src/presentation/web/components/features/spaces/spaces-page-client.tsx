'use client';

/**
 * SpacesPageClient — the Spaces page (spec 120). Spaces keep bodies of work
 * apart (personal vs work, one client vs another): memory shared inside a
 * space never reaches another. Product lines group repositories inside a
 * space, and rules decide which space a repository lands in.
 *
 * Thin presentation: every change is one server action backed by a use case;
 * after a success the page refreshes so the overview is re-read from the
 * server rather than patched locally.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Boxes } from 'lucide-react';
import type { SpacesOverview } from '@shepai/core/application/use-cases/spaces/get-spaces-overview.use-case';
import { CreateSpaceForm } from './create-space-form';
import { SpaceCard } from './space-card';
import { RepositoryPlacements } from './repository-placements';
import type { RunSpaceAction, SpaceActionOutcome } from './spaces-types';

export interface SpacesPageClientProps {
  overview: SpacesOverview;
  /** Set when the overview could not be loaded. */
  loadError?: string;
}

export function SpacesPageClient({ overview, loadError }: SpacesPageClientProps) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const [error, setError] = useState<string | null>(loadError ?? null);

  const run = useCallback<RunSpaceAction>(
    async (action) => {
      setError(null);
      const result: SpaceActionOutcome = await action().catch((cause: unknown) => ({
        ok: false,
        error: cause instanceof Error ? cause.message : t('spaces.errors.actionFailed'),
      }));
      if (!result.ok) {
        setError(result.error ?? t('spaces.errors.actionFailed'));
        return false;
      }
      router.refresh();
      return true;
    },
    [router, t]
  );

  return (
    <div data-testid="spaces-page" className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <header className="flex items-center gap-2">
        <Boxes className="size-5" />
        <div>
          <h1 className="text-lg font-semibold">{t('spaces.title')}</h1>
          <p className="text-muted-foreground text-xs">{t('spaces.subtitle')}</p>
        </div>
      </header>

      {error ? (
        <p role="alert" data-testid="spaces-error" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      <CreateSpaceForm run={run} />

      <div className="grid gap-4 md:grid-cols-2">
        {overview.spaces.map((space) => (
          <SpaceCard key={space.space.id} overview={space} run={run} />
        ))}
      </div>

      <RepositoryPlacements
        repositories={overview.repositories}
        spaces={overview.spaces}
        run={run}
      />
    </div>
  );
}
