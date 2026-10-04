/**
 * Opportunity scoring (spec 126): what an opportunity's signals add up to,
 * its value per review hour under a space's weights, and the line — the
 * opportunities that fit the week's review capacity.
 *
 *   value = reach × customers + revenue × revenueAtStake ÷ 1,000
 *           + urgency × urgentSignals + strategic × (strategic ? 1 : 0)
 *   score = value × confidence ÷ reviewHours
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import {
  OpportunityStatus,
  type Opportunity,
  type OpportunityWeights,
  type Signal,
} from '../generated/output';

/** Revenue weights count each this much a month. */
export const REVENUE_UNIT = 1_000;

/** Smallest review estimate a score divides by, so tiny estimates do not explode. */
export const MIN_REVIEW_HOURS = 0.5;

/** Weights a space uses until it sets its own. */
export const DEFAULT_OPPORTUNITY_WEIGHTS: Omit<OpportunityWeights, 'spaceId'> = {
  reach: 1,
  revenue: 2,
  urgency: 3,
  strategic: 5,
  weeklyReviewHours: 20,
};

/** Opportunities still competing for capacity, best first. */
export const OPEN_STATUSES: readonly OpportunityStatus[] = [
  OpportunityStatus.Building,
  OpportunityStatus.Accepted,
  OpportunityStatus.Proposed,
];

/** Statuses an opportunity can be built from. */
export const BUILDABLE_STATUSES: readonly OpportunityStatus[] = [
  OpportunityStatus.Proposed,
  OpportunityStatus.Accepted,
];

export interface OpportunityEvidence {
  signals: number;
  /** Distinct named customers, plus one per signal without a customer. */
  customers: number;
  /** The largest monthly revenue per named customer, summed. */
  revenueAtStake: number;
  urgentSignals: number;
}

export interface ScoredOpportunity {
  opportunity: Opportunity;
  evidence: OpportunityEvidence;
  value: number;
  /** Value per review hour, after confidence. */
  score: number;
}

export interface OpportunityLine {
  /** Building, then accepted opportunities that fit, by score. */
  inLine: ScoredOpportunity[];
  /** Accepted opportunities that did not fit, by score. */
  waiting: ScoredOpportunity[];
  usedHours: number;
  capacityHours: number;
}

function customerKey(customer: string | undefined): string | undefined {
  const key = customer?.trim().toLowerCase();
  return key === '' ? undefined : key;
}

export function evidenceOf(signals: readonly Signal[]): OpportunityEvidence {
  const revenueByCustomer = new Map<string, number>();
  let anonymous = 0;
  for (const signal of signals) {
    const key = customerKey(signal.customer);
    if (key === undefined) {
      anonymous += 1;
      continue;
    }
    const revenue = signal.monthlyRevenue ?? 0;
    revenueByCustomer.set(key, Math.max(revenueByCustomer.get(key) ?? 0, revenue));
  }
  let revenueAtStake = 0;
  for (const revenue of revenueByCustomer.values()) revenueAtStake += revenue;
  return {
    signals: signals.length,
    customers: revenueByCustomer.size + anonymous,
    revenueAtStake,
    urgentSignals: signals.filter((signal) => signal.urgent).length,
  };
}

export function opportunityValue(
  opportunity: Pick<Opportunity, 'strategic'>,
  evidence: OpportunityEvidence,
  weights: Omit<OpportunityWeights, 'spaceId'>
): number {
  return (
    weights.reach * evidence.customers +
    (weights.revenue * evidence.revenueAtStake) / REVENUE_UNIT +
    weights.urgency * evidence.urgentSignals +
    (opportunity.strategic ? weights.strategic : 0)
  );
}

export function scoreOpportunity(
  opportunity: Opportunity,
  signals: readonly Signal[],
  weights: Omit<OpportunityWeights, 'spaceId'>
): ScoredOpportunity {
  const evidence = evidenceOf(signals);
  const value = opportunityValue(opportunity, evidence, weights);
  const hours = Math.max(opportunity.reviewHours, MIN_REVIEW_HOURS);
  return { opportunity, evidence, value, score: (value * opportunity.confidence) / hours };
}

/** Best score first; ties go to the cheaper review, then the older opportunity. */
export function rankOpportunities(scored: readonly ScoredOpportunity[]): ScoredOpportunity[] {
  return [...scored].sort(
    (a, b) =>
      b.score - a.score ||
      a.opportunity.reviewHours - b.opportunity.reviewHours ||
      a.opportunity.createdAt.getTime() - b.opportunity.createdAt.getTime()
  );
}

/**
 * The week's line: building opportunities hold their hours first; accepted
 * ones join best-first while their hours fit, and the rest wait.
 */
export function drawLine(
  scored: readonly ScoredOpportunity[],
  capacityHours: number
): OpportunityLine {
  const ranked = rankOpportunities(scored);
  const inLine = ranked.filter((s) => s.opportunity.status === OpportunityStatus.Building);
  let usedHours = inLine.reduce((sum, s) => sum + s.opportunity.reviewHours, 0);
  const waiting: ScoredOpportunity[] = [];
  for (const candidate of ranked) {
    if (candidate.opportunity.status !== OpportunityStatus.Accepted) continue;
    if (usedHours + candidate.opportunity.reviewHours <= capacityHours) {
      inLine.push(candidate);
      usedHours += candidate.opportunity.reviewHours;
    } else {
      waiting.push(candidate);
    }
  }
  return { inLine, waiting, usedHours, capacityHours };
}
