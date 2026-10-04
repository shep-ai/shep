'use client';

/**
 * OpportunitiesPageClient — the Opportunities page (spec 126): a space's
 * bets ranked by value per review hour, the line that fits this week's review
 * capacity, signals waiting to be linked, and the forms and weights behind
 * the ranking.
 *
 * Thin presentation: each change is one server action backed by a use case;
 * after a success the page refreshes to re-read the board.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { useTranslation } from 'react-i18next';
import { Target } from 'lucide-react';
import type { OpportunityBoard } from '@shepai/core/application/use-cases/opportunities/get-opportunity-board.use-case';
import { useRunAction } from '@/hooks/use-run-action';
import { CapacityBar } from './capacity-bar';
import { OpportunityRow } from './opportunity-row';
import { SignalInbox } from './signal-inbox';
import { AddSignalForm } from './add-signal-form';
import { AddOpportunityForm } from './add-opportunity-form';
import { OpportunityWeightsForm } from './opportunity-weights-form';
import { FeedbackThemes } from './feedback-themes';
import { FeedbackKeysPanel } from './feedback-keys-panel';
import type { OpportunityPageOptions } from './opportunities-types';
import type { FeedbackTheme } from '@shepai/core/domain/shared/feedback-themes';
import type { FeedbackKeyView } from '@shepai/core/application/use-cases/feedback/manage-feedback-keys.use-case';

export interface OpportunitiesPageClientProps {
  board?: OpportunityBoard;
  options: OpportunityPageOptions;
  /** Themes among the space's unlinked signals (spec 127). */
  themes?: FeedbackTheme[];
  /** The space's feedback keys (spec 127). */
  feedbackKeys?: FeedbackKeyView[];
  /** Set when the board could not be loaded. */
  loadError?: string;
}

export function OpportunitiesPageClient({
  board,
  options,
  themes = [],
  feedbackKeys = [],
  loadError,
}: OpportunitiesPageClientProps) {
  const { t } = useTranslation('web');
  const { run, error } = useRunAction({
    fallbackError: t('opportunities.errors.actionFailed'),
    ...(loadError ? { initialError: loadError } : {}),
  });
  const inLine = new Set(board?.line.inLine.map((scored) => scored.opportunity.id));

  return (
    <div data-testid="opportunities-page" className="mx-auto w-full max-w-5xl space-y-5 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Target className="size-5" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{t('opportunities.title')}</h1>
          <p className="text-muted-foreground text-xs">{t('opportunities.subtitle')}</p>
        </div>
        <nav aria-label={t('opportunities.space')} className="flex flex-wrap gap-1">
          {options.spaces.map((space) => (
            <Link
              key={space.id}
              href={`/opportunities?space=${space.slug}` as Route}
              aria-current={space.id === board?.space.id ? 'page' : undefined}
              className={
                space.id === board?.space.id
                  ? 'bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs'
                  : 'hover:bg-muted rounded-md px-2 py-1 text-xs'
              }
            >
              {space.name}
            </Link>
          ))}
        </nav>
      </header>

      {error ? (
        <p role="alert" data-testid="opportunities-error" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      {board ? (
        <>
          <CapacityBar
            usedHours={board.line.usedHours}
            capacityHours={board.line.capacityHours}
            waiting={board.line.waiting.length}
          />
          <section className="space-y-2">
            <AddOpportunityForm
              spaceId={board.space.id}
              productLines={options.productLines}
              run={run}
            />
            {board.ranked.length === 0 ? (
              <p
                data-testid="opportunities-empty"
                className="text-muted-foreground py-6 text-center text-sm"
              >
                {t('opportunities.empty')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {board.ranked.map((scored) => (
                  <OpportunityRow
                    key={scored.opportunity.id}
                    scored={scored}
                    inLine={inLine.has(scored.opportunity.id)}
                    projects={options.projects}
                    run={run}
                  />
                ))}
              </ul>
            )}
          </section>
          <FeedbackThemes spaceId={board.space.id} themes={themes} run={run} />
          <section className="space-y-2">
            <AddSignalForm spaceId={board.space.id} run={run} />
            <SignalInbox
              signals={board.unlinkedSignals}
              opportunities={board.ranked.map(({ opportunity }) => opportunity)}
              run={run}
            />
          </section>
          <FeedbackKeysPanel spaceId={board.space.id} keys={feedbackKeys} run={run} />
          <OpportunityWeightsForm
            key={JSON.stringify(board.weights)}
            weights={board.weights}
            run={run}
          />
        </>
      ) : null}
    </div>
  );
}
