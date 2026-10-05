/**
 * "3 signals · 2 customers · 6500/month · 1 urgent" for an opportunity or a
 * theme (specs 126, 127), with each count's plural.
 */

import type { TFunction } from 'i18next';
import type { OpportunityEvidence } from '@shepai/core/domain/shared/opportunity-score';

const PART = 'opportunities.row.evidenceParts';

export function formatEvidence(t: TFunction<'web'>, evidence: OpportunityEvidence): string {
  return [
    t(`${PART}.signals`, { count: evidence.signals }),
    t(`${PART}.customers`, { count: evidence.customers }),
    t(`${PART}.revenue`, { revenue: evidence.revenueAtStake }),
    t(`${PART}.urgent`, { count: evidence.urgentSignals }),
  ].join(' · ');
}
