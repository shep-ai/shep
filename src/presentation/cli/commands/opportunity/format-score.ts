/** How a scored opportunity reads in the terminal (spec 126). */

import type { ScoredOpportunity } from '@/domain/shared/opportunity-score.js';
import { getCliI18n } from '../../i18n.js';

const SCORE_DIGITS = 2;

export function formatScore(scored: ScoredOpportunity): string {
  return scored.score.toFixed(SCORE_DIGITS);
}

export function formatEvidence(scored: ScoredOpportunity): string {
  return getCliI18n().t('cli:commands.opportunity.evidence', {
    signals: scored.evidence.signals,
    customers: scored.evidence.customers,
    revenue: scored.evidence.revenueAtStake,
    urgent: scored.evidence.urgentSignals,
  });
}
