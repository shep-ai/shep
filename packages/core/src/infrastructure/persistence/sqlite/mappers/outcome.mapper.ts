/** Row ⇄ entity conversion for opportunity outcomes (spec 130). */

import type { OpportunityOutcome, OutcomeVerdict } from '../../../../domain/generated/output.js';
import { defined, millis, optionalDate, optionalMillis } from './row-values.js';

export interface OutcomeRow {
  id: string;
  opportunity_id: string;
  space_id: string;
  shipped_at: number;
  review_at: number;
  verdict: string;
  signals_before: number | null;
  signals_after: number | null;
  judged_at: number | null;
  actual_review_hours: number | null;
  created_at: number;
  updated_at: number;
}

export function outcomeToDatabase(outcome: OpportunityOutcome): OutcomeRow {
  return {
    id: outcome.id,
    opportunity_id: outcome.opportunityId,
    space_id: outcome.spaceId,
    shipped_at: millis(outcome.shippedAt),
    review_at: millis(outcome.reviewAt),
    verdict: outcome.verdict,
    signals_before: outcome.signalsBefore ?? null,
    signals_after: outcome.signalsAfter ?? null,
    judged_at: optionalMillis(outcome.judgedAt),
    actual_review_hours: outcome.actualReviewHours ?? null,
    created_at: millis(outcome.createdAt),
    updated_at: millis(outcome.updatedAt),
  };
}

export function outcomeFromDatabase(row: OutcomeRow): OpportunityOutcome {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    spaceId: row.space_id,
    shippedAt: new Date(row.shipped_at),
    reviewAt: new Date(row.review_at),
    verdict: row.verdict as OutcomeVerdict,
    ...defined({
      signalsBefore: row.signals_before,
      signalsAfter: row.signals_after,
      judgedAt: optionalDate(row.judged_at),
      actualReviewHours: row.actual_review_hours,
    }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
