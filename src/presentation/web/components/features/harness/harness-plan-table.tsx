'use client';

import { useTranslation } from 'react-i18next';
import type { ContextPlan } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { VISIBILITY_CLASS, formatTokens } from './harness-format';

export interface HarnessPlanTableProps {
  plan: ContextPlan;
  onView: (chunkId: string, label: string) => void;
  onWhy: (chunkId: string) => void;
}

/** "What the model saw" on one turn: every candidate with its visibility and reason (spec 119, F6). */
export function HarnessPlanTable({ plan, onView, onWhy }: HarnessPlanTableProps) {
  const { t } = useTranslation('web');
  return (
    <div className="overflow-x-auto" data-testid="harness-plan-table">
      <p className="text-muted-foreground mb-2 text-xs">
        {t('harness.plan.summary', {
          tokens: formatTokens(plan.estimatedTokens),
          budget: formatTokens(plan.tokenBudget),
          count: plan.candidateCount,
        })}
        {plan.shadow ? ` · ${t('harness.plan.shadow')}` : ''}
        {plan.degraded ? ` · ${t('harness.plan.degraded')}` : ''}
        {plan.overBudget ? ` · ${t('harness.plan.overBudget')}` : ''}
      </p>
      <table className="w-full text-xs">
        <thead className="text-muted-foreground text-left">
          <tr>
            <th className="py-1 pr-2 font-normal">{t('harness.plan.chunk')}</th>
            <th className="py-1 pr-2 font-normal">{t('harness.plan.visibility')}</th>
            <th className="py-1 pr-2 text-right font-normal">{t('harness.plan.tokens')}</th>
            <th className="py-1 pr-2 text-right font-normal">{t('harness.plan.relevance')}</th>
            <th className="py-1 pr-2 font-normal">{t('harness.plan.reason')}</th>
            <th className="py-1 font-normal" />
          </tr>
        </thead>
        <tbody>
          {plan.chunks.map((c) => (
            <tr key={c.chunkId} className="border-t">
              <td className="max-w-[260px] truncate py-1 pr-2" title={c.label}>
                <span className="text-muted-foreground">{c.kind}</span> {c.label}
              </td>
              <td className="py-1 pr-2">
                <span className={`rounded px-1.5 py-0.5 ${VISIBILITY_CLASS[c.visibility]}`}>
                  {t(`harness.visibility.${c.visibility}`)}
                </span>
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {formatTokens(c.tokens)}/{formatTokens(c.rawTokens)}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {c.relevance === undefined ? '–' : c.relevance.toFixed(2)}
              </td>
              <td className="py-1 pr-2">
                {c.reasonCode} · {t(`harness.source.${c.source}`)}
              </td>
              <td className="py-1 whitespace-nowrap">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => onView(c.chunkId, c.label)}
                >
                  {t('harness.plan.view')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => onWhy(c.chunkId)}
                >
                  {t('harness.plan.why')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
