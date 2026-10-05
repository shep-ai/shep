'use client';

/**
 * FeedbackThemes — unlinked signals grouped by the words they share (spec
 * 127), each with the evidence behind it and a one-step promotion to an
 * opportunity with every signal linked.
 */

import { useState } from 'react';
import { formatEvidence } from './format-evidence';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';
import type { FeedbackTheme } from '@shepai/core/domain/shared/feedback-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { RunAction } from '@/hooks/use-run-action';
import { promoteTheme } from '@/app/actions/manage-feedback';

const DEFAULT_HOURS = '4';
/** Signal titles shown under a theme; the rest are counted in its evidence. */
const SHOWN_SIGNALS = 3;

export interface FeedbackThemesProps {
  spaceId: string;
  themes: FeedbackTheme[];
  run: RunAction;
}

function ThemeCard({
  spaceId,
  theme,
  run,
}: {
  spaceId: string;
  theme: FeedbackTheme;
  run: RunAction;
}) {
  const { t } = useTranslation('web');
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const { key, evidence } = theme;
  return (
    <li
      data-testid={`feedback-theme-${key}`}
      className="bg-card space-y-1.5 rounded-md border p-3 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{theme.label}</span>
        <span className="text-muted-foreground flex-1">{formatEvidence(t, evidence)}</span>
        <form
          className="flex items-center gap-1"
          onSubmit={async (event) => {
            event.preventDefault();
            await run(() =>
              promoteTheme({ space: spaceId, theme: key, reviewHours: Number.parseFloat(hours) })
            );
          }}
        >
          <Input
            type="number"
            min={0.5}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            aria-label={t('opportunities.themes.hours')}
            className="h-7 w-16 text-xs"
            data-testid={`feedback-theme-hours-${key}`}
          />
          <Button
            type="submit"
            size="xs"
            variant="outline"
            data-testid={`feedback-theme-promote-${key}`}
          >
            <ArrowUpRight />
            {t('opportunities.themes.promote')}
          </Button>
        </form>
      </div>
      <ul className="text-muted-foreground list-disc ps-5">
        {theme.signals.slice(0, SHOWN_SIGNALS).map((signal) => (
          <li key={signal.id}>{signal.title}</li>
        ))}
      </ul>
    </li>
  );
}

export function FeedbackThemes({ spaceId, themes, run }: FeedbackThemesProps) {
  const { t } = useTranslation('web');
  return (
    <section data-testid="feedback-themes" className="space-y-2">
      <h2 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {t('opportunities.themes.title')}
      </h2>
      {themes.length === 0 ? (
        <p data-testid="feedback-themes-empty" className="text-muted-foreground text-xs">
          {t('opportunities.themes.empty')}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {themes.map((theme) => (
            <ThemeCard key={theme.key} spaceId={spaceId} theme={theme} run={run} />
          ))}
        </ul>
      )}
    </section>
  );
}
