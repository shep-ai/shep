'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { HarnessDecisionExplanation } from '@shepai/core/application/use-cases/harness/explain-harness-decision.use-case';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { explainHarnessDecision } from '@/app/actions/harness-queries';
import { includeHarnessChunk } from '@/app/actions/harness-commands';
import { VISIBILITY_CLASS, formatCost } from './harness-format';

export interface HarnessWhyTarget {
  planId: string;
  chunkId: string;
}

export interface HarnessWhyDrawerProps {
  target: HarnessWhyTarget | null;
  onClose: () => void;
}

/**
 * "Why?" (spec 119, F6): the visibility a chunk got, its relevance on the
 * bands, who decided, provider latency and cost, probabilities only when the
 * provider returned them, and "Include from next turn".
 */
export function HarnessWhyDrawer({ target, onClose }: HarnessWhyDrawerProps) {
  const { t } = useTranslation('web');
  const [why, setWhy] = useState<HarnessDecisionExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setWhy(null);
    setError(null);
    void explainHarnessDecision(target).then((r) => {
      if (cancelled) return;
      if (r.ok) setWhy(r.data);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [target]);

  function include() {
    if (!target) return;
    startTransition(async () => {
      const r = await includeHarnessChunk(target.planId, target.chunkId, true);
      if (r.ok) toast.success(t('harness.why.included'));
      else toast.error(r.error);
    });
  }

  const planned = why?.planned;
  const d = why?.decision;
  const probabilities = planned?.probabilities ? Object.entries(planned.probabilities) : [];

  return (
    <Sheet open={target !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="w-[420px] overflow-y-auto" data-testid="harness-why-drawer">
        <SheetHeader>
          <SheetTitle className="text-sm">{t('harness.why.title')}</SheetTitle>
        </SheetHeader>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {planned ? (
          <div className="space-y-3 p-4 text-xs">
            <p className="font-mono break-all">{planned.label}</p>
            <p>
              <span className={`rounded px-1.5 py-0.5 ${VISIBILITY_CLASS[planned.visibility]}`}>
                {t(`harness.visibility.${planned.visibility}`)}
              </span>{' '}
              · {planned.reasonCode} · {t(`harness.source.${planned.source}`)}
            </p>
            <p className="text-muted-foreground">
              {t('harness.why.tokens', { visible: planned.tokens, raw: planned.rawTokens })}
            </p>
            {why?.score !== undefined ? (
              <div>
                <p>{t('harness.why.relevance', { score: why.score.toFixed(2) })}</p>
                <div className="relative mt-2 h-2 rounded bg-gradient-to-r from-zinc-300 via-violet-300 to-emerald-400">
                  <span
                    className="absolute -top-1 h-4 w-0.5 bg-black dark:bg-white"
                    style={{ left: `${Math.min(100, Math.max(0, why.score * 100))}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-1">
                  {t('harness.why.bands', {
                    hide: why.bands.hide,
                    long: why.bands.long,
                    full: why.bands.full,
                  })}
                </p>
              </div>
            ) : null}
            {probabilities.length > 0 ? (
              <ul>
                {probabilities.map(([k, p]) => (
                  <li key={k}>
                    {k}: {(p * 100).toFixed(1)}%
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t('harness.why.noProbabilities')}</p>
            )}
            {d ? (
              <p className="text-muted-foreground">
                {t('harness.why.provider', {
                  provider: d.providerId,
                  latency: d.latencyMs,
                  cost: formatCost(d.estimatedCostUsd),
                })}
                {d.shadow ? ` · ${t('harness.why.shadow')}` : ''}
                {d.degraded ? ` · ${t('harness.why.degraded')}` : ''}
              </p>
            ) : null}
            <p className="text-muted-foreground font-mono text-[10px] break-all">
              {JSON.stringify(why?.sourceIds)}
            </p>
            <Button
              size="sm"
              disabled={isPending}
              onClick={include}
              data-testid="harness-why-include"
            >
              {t('harness.why.include')}
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
