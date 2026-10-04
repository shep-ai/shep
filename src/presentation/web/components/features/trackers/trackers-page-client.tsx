'use client';

/**
 * TrackersPageClient — the Connections page (spec 122). Linear and Jira
 * accounts, the rules that keep their issues in shep projects, and a button
 * to sync everything now. The daemon runs rules on their own interval.
 *
 * Thin presentation: each change is one server action backed by a use case;
 * after a success the page refreshes to re-read the overview.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import type { TrackerOverview } from '@shepai/core/application/use-cases/trackers/get-tracker-overview.use-case';
import { Button } from '@/components/ui/button';
import { runTrackerSync } from '@/app/actions/manage-trackers';
import { AddConnectionForm } from './add-connection-form';
import { TrackerConnectionCard } from './tracker-connection-card';
import type { RunTrackerAction, TrackerActionOutcome } from './trackers-types';

export interface TrackersPageClientProps {
  overview: TrackerOverview;
  /** Set when the overview could not be loaded. */
  loadError?: string;
}

export function TrackersPageClient({ overview, loadError }: TrackersPageClientProps) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [syncing, setSyncing] = useState(false);

  const run = useCallback<RunTrackerAction>(
    async (action) => {
      setError(null);
      const result: TrackerActionOutcome = await action().catch((cause: unknown) => ({
        ok: false,
        error: cause instanceof Error ? cause.message : t('trackers.errors.actionFailed'),
      }));
      router.refresh();
      if (!result.ok) {
        setError(result.error ?? t('trackers.errors.actionFailed'));
        return false;
      }
      return true;
    },
    [router, t]
  );

  async function syncAll() {
    setSyncing(true);
    try {
      await run(() => runTrackerSync(undefined));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div data-testid="trackers-page" className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <header className="flex items-center gap-2">
        <ArrowLeftRight className="size-5" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{t('trackers.title')}</h1>
          <p className="text-muted-foreground text-xs">{t('trackers.subtitle')}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={syncing || overview.connections.length === 0}
          onClick={syncAll}
          data-testid="trackers-sync-all"
        >
          <RefreshCw className={syncing ? 'animate-spin' : undefined} />
          {t('trackers.syncAll')}
        </Button>
      </header>

      {error ? (
        <p role="alert" data-testid="trackers-error" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      <AddConnectionForm spaces={overview.spaces} run={run} />

      {overview.connections.length === 0 ? (
        <p data-testid="trackers-empty" className="text-muted-foreground py-8 text-center text-sm">
          {t('trackers.empty')}
        </p>
      ) : (
        <div className="space-y-4">
          {overview.connections.map((connection) => (
            <TrackerConnectionCard
              key={connection.connection.id}
              overview={connection}
              projects={overview.projects}
              run={run}
            />
          ))}
        </div>
      )}
    </div>
  );
}
