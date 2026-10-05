'use client';

/**
 * OpportunityRow — one ranked opportunity (spec 126): whether it is in this
 * week's line, its value per review hour, the evidence behind it, and the
 * decisions that can still be made.
 */

import { useTranslation } from 'react-i18next';
import type { ScoredOpportunity } from '@shepai/core/domain/shared/opportunity-score';
import { OpportunitySource } from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';
import type { RunAction } from '@/hooks/use-run-action';
import { OpportunityActions } from './opportunity-actions';

const SCORE_DIGITS = 2;

export interface OpportunityRowProps {
  scored: ScoredOpportunity;
  inLine: boolean;
  projects: { id: string; name: string }[];
  run: RunAction;
}

export function OpportunityRow({ scored, inLine, projects, run }: OpportunityRowProps) {
  const { t } = useTranslation('web');
  const { opportunity, evidence } = scored;
  return (
    <li
      data-testid={`opportunity-${opportunity.id}`}
      className="bg-card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-xs"
    >
      <span
        className={inLine ? 'bg-primary size-2 rounded-full' : 'bg-muted size-2 rounded-full'}
        title={t(inLine ? 'opportunities.row.inLine' : 'opportunities.row.outOfLine')}
        aria-label={t(inLine ? 'opportunities.row.inLine' : 'opportunities.row.outOfLine')}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{opportunity.title}</span>
          <Badge variant="outline" className="text-[10px]">
            {t(`opportunities.status.${opportunity.status}`)}
          </Badge>
          {opportunity.source && opportunity.source !== OpportunitySource.Manual ? (
            <Badge variant="secondary" className="text-[10px]">
              {t(`opportunities.source.${opportunity.source}`)}
            </Badge>
          ) : null}
          {opportunity.strategic ? (
            <Badge variant="secondary" className="text-[10px]">
              {t('opportunities.row.strategic')}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5">
          {t('opportunities.row.evidence', {
            signals: evidence.signals,
            customers: evidence.customers,
            revenue: evidence.revenueAtStake,
            urgent: evidence.urgentSignals,
          })}
        </p>
        {opportunity.brief ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-2" title={opportunity.brief}>
            {opportunity.brief}
          </p>
        ) : null}
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums">
          {scored.score.toFixed(SCORE_DIGITS)}
        </div>
        <div className="text-muted-foreground">
          {t('opportunities.row.cost', {
            hours: opportunity.reviewHours,
            confidence: Math.round(opportunity.confidence * 100),
          })}
        </div>
      </div>
      <OpportunityActions opportunity={opportunity} projects={projects} run={run} />
    </li>
  );
}
