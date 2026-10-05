/**
 * Outcomes (spec 130): whether a shipped opportunity solved what it was built
 * for, who to tell, and how good the space's review-hour estimates were.
 *
 * A signal reads like an opportunity when it is linked to it, or when its
 * terms overlap the opportunity's title and problem, or one of its linked
 * signals, as much as feedback themes require. Before and after are counted
 * over equal windows around the ship time.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import {
  OutcomeVerdict,
  type OpportunityOutcome,
  type Opportunity,
  type Signal,
} from '../generated/output';
import { THEME_SIMILARITY } from './feedback-themes';
import { signalTerms, termSimilarity, textTerms } from './text-terms';

export const OUTCOME_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = OUTCOME_WINDOW_DAYS * DAY_MS;
/** Solved when reports after shipping are at most this share of those before. */
const SOLVED_SHARE = 0.5;

export function outcomeReviewAt(shippedAt: Date): Date {
  return new Date(shippedAt.getTime() + WINDOW_MS);
}

export function judgeOutcome(before: number, after: number): OutcomeVerdict {
  return after <= before * SOLVED_SHARE ? OutcomeVerdict.Solved : OutcomeVerdict.Persisting;
}

export interface OutcomeAssessment {
  signalsBefore: number;
  signalsAfter: number;
  verdict: OutcomeVerdict;
}

/** The space's `signals` that read like `opportunity`. */
export function similarSignals(opportunity: Opportunity, signals: readonly Signal[]): Signal[] {
  const linked = signals.filter((signal) => signal.opportunityId === opportunity.id);
  const references = [
    textTerms(`${opportunity.title} ${opportunity.problem ?? ''}`),
    ...linked.map(signalTerms),
  ];
  return signals.filter((signal) => {
    if (signal.opportunityId === opportunity.id) return true;
    const terms = signalTerms(signal);
    return references.some((reference) => termSimilarity(terms, reference) >= THEME_SIMILARITY);
  });
}

/** Counts and verdict for `outcome` from the space's `signals`. */
export function assessOutcome(
  outcome: OpportunityOutcome,
  opportunity: Opportunity,
  signals: readonly Signal[]
): OutcomeAssessment {
  const shipped = new Date(outcome.shippedAt).getTime();
  let signalsBefore = 0;
  let signalsAfter = 0;
  for (const signal of similarSignals(opportunity, signals)) {
    const at = new Date(signal.createdAt).getTime();
    if (at < shipped && at >= shipped - WINDOW_MS) signalsBefore += 1;
    else if (at >= shipped && at <= shipped + WINDOW_MS) signalsAfter += 1;
  }
  return { signalsBefore, signalsAfter, verdict: judgeOutcome(signalsBefore, signalsAfter) };
}

export interface CustomerToTell {
  customer: string;
  signalIds: string[];
  /** Links back to the customer's reports, where they have one. */
  urls: string[];
}

/** Each customer on `signals` not yet told, in order of first appearance. */
export function customersToTell(signals: readonly Signal[]): CustomerToTell[] {
  const byCustomer = new Map<string, CustomerToTell>();
  for (const signal of signals) {
    if (!signal.customer || signal.toldAt) continue;
    const entry = byCustomer.get(signal.customer) ?? {
      customer: signal.customer,
      signalIds: [],
      urls: [],
    };
    entry.signalIds.push(signal.id);
    if (signal.url) entry.urls.push(signal.url);
    byCustomer.set(signal.customer, entry);
  }
  return [...byCustomer.values()];
}

export interface OutcomeCalibration {
  /** Outcomes judged Solved or Persisting. */
  judged: number;
  solved: number;
  /** Outcomes with actual review hours recorded. */
  timed: number;
  /** Actual over estimated review hours across the timed outcomes. */
  hoursRatio?: number;
}

const RATIO_DECIMALS = 100;

export function calibrate(
  entries: readonly { estimatedHours: number; outcome: OpportunityOutcome }[]
): OutcomeCalibration {
  let judged = 0;
  let solved = 0;
  let timed = 0;
  let estimated = 0;
  let actual = 0;
  for (const { estimatedHours, outcome } of entries) {
    if (outcome.verdict !== OutcomeVerdict.Pending) judged += 1;
    if (outcome.verdict === OutcomeVerdict.Solved) solved += 1;
    if (outcome.actualReviewHours !== undefined && estimatedHours > 0) {
      timed += 1;
      estimated += estimatedHours;
      actual += outcome.actualReviewHours;
    }
  }
  return {
    judged,
    solved,
    timed,
    ...(timed > 0
      ? { hoursRatio: Math.round((actual / estimated) * RATIO_DECIMALS) / RATIO_DECIMALS }
      : {}),
  };
}
