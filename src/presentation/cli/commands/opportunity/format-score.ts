/** How a scored opportunity reads in the terminal (spec 126). */

import type { OpportunityEvidence, ScoredOpportunity } from '@/domain/shared/opportunity-score.js';
import { getCliI18n } from '../../i18n.js';

const SCORE_DIGITS = 2;

export function formatScore(scored: ScoredOpportunity): string {
  return scored.score.toFixed(SCORE_DIGITS);
}

/** "3 signals, 2 customers, 6500/month, 1 urgent", with each count's plural. */
export function formatEvidence(evidence: OpportunityEvidence): string {
  const t = getCliI18n().t;
  const part = 'cli:commands.opportunity.evidenceParts';
  return [
    t(`${part}.signals`, { count: evidence.signals }),
    t(`${part}.customers`, { count: evidence.customers }),
    t(`${part}.revenue`, { revenue: evidence.revenueAtStake }),
    t(`${part}.urgent`, { count: evidence.urgentSignals }),
  ].join(', ');
}
