/** Sample outcomes for the Opportunities stories (spec 130). */

import {
  OpportunityStatus,
  OutcomeVerdict,
  type OpportunityOutcome,
} from '@shepai/core/domain/generated/output';
import type { OutcomeView } from '@shepai/core/application/use-cases/outcomes/manage-outcomes.use-case';
import type { OutcomeCalibration } from '@shepai/core/domain/shared/outcomes';
import { CHECKOUT, EXPORT } from './opportunities-fixtures';

const SHIPPED = new Date('2026-09-20T10:00:00Z');
const REVIEW = new Date('2026-10-04T10:00:00Z');

function outcome(opportunityId: string, extra: Partial<OpportunityOutcome>): OpportunityOutcome {
  return {
    id: `out-${opportunityId}`,
    opportunityId,
    spaceId: 'space-acme',
    shippedAt: SHIPPED,
    reviewAt: REVIEW,
    verdict: OutcomeVerdict.Pending,
    createdAt: SHIPPED,
    updatedAt: SHIPPED,
    ...extra,
  };
}

/** Shipped; Globex still to tell. */
export const PENDING_OUTCOME: OutcomeView = {
  opportunity: { ...CHECKOUT.opportunity, status: OpportunityStatus.Shipped, shippedAt: SHIPPED },
  outcome: outcome(CHECKOUT.opportunity.id, {}),
  customers: [
    { customer: 'Globex', signalIds: ['sig-1'], urls: ['https://support.acme.com/t/812'] },
    { customer: 'Initech', signalIds: ['sig-2'], urls: [] },
  ],
};

/** Judged Solved, with its real review hours. */
export const SOLVED_OUTCOME: OutcomeView = {
  opportunity: { ...EXPORT.opportunity, status: OpportunityStatus.Shipped, shippedAt: SHIPPED },
  outcome: outcome(EXPORT.opportunity.id, {
    verdict: OutcomeVerdict.Solved,
    signalsBefore: 6,
    signalsAfter: 2,
    judgedAt: REVIEW,
    actualReviewHours: 14,
  }),
  customers: [],
};

export const PERSISTING_OUTCOME: OutcomeView = {
  ...SOLVED_OUTCOME,
  outcome: { ...SOLVED_OUTCOME.outcome, verdict: OutcomeVerdict.Persisting, signalsAfter: 5 },
};

export const CALIBRATION: OutcomeCalibration = { judged: 4, solved: 3, timed: 2, hoursRatio: 1.4 };
