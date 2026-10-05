import { describe, it, expect } from 'vitest';
import {
  OutcomeVerdict,
  OpportunityStatus,
  SignalKind,
  type OpportunityOutcome,
  type Opportunity,
  type Signal,
} from '@/domain/generated/output.js';
import {
  OUTCOME_WINDOW_DAYS,
  assessOutcome,
  calibrate,
  customersToTell,
  judgeOutcome,
  outcomeReviewAt,
} from '@/domain/shared/outcomes.js';

const DAY = 24 * 60 * 60 * 1000;
const SHIPPED = new Date('2026-10-01T00:00:00Z');

function daysFromShip(days: number): Date {
  return new Date(SHIPPED.getTime() + days * DAY);
}

function signal(id: string, title: string, days: number, extra: Partial<Signal> = {}): Signal {
  const at = daysFromShip(days);
  return {
    id,
    spaceId: 's1',
    kind: SignalKind.Feedback,
    title,
    urgent: false,
    createdAt: at,
    updatedAt: at,
    ...extra,
  };
}

const OPPORTUNITY: Opportunity = {
  id: 'opp-1',
  spaceId: 's1',
  title: 'Faster guest checkout',
  problem: 'Guest checkout times out on mobile',
  status: OpportunityStatus.Shipped,
  reviewHours: 6,
  confidence: 0.7,
  strategic: false,
  shippedAt: SHIPPED,
  createdAt: SHIPPED,
  updatedAt: SHIPPED,
};

function outcome(extra: Partial<OpportunityOutcome> = {}): OpportunityOutcome {
  return {
    id: 'out-1',
    opportunityId: OPPORTUNITY.id,
    spaceId: 's1',
    shippedAt: SHIPPED,
    reviewAt: outcomeReviewAt(SHIPPED),
    verdict: OutcomeVerdict.Pending,
    createdAt: SHIPPED,
    updatedAt: SHIPPED,
    ...extra,
  };
}

describe('outcomes (spec 130)', () => {
  it('reviews an outcome a window after shipping', () => {
    expect(outcomeReviewAt(SHIPPED)).toEqual(daysFromShip(OUTCOME_WINDOW_DAYS));
  });

  it('calls it Solved when similar reports fell to half or less', () => {
    expect(judgeOutcome(6, 3)).toBe(OutcomeVerdict.Solved);
    expect(judgeOutcome(6, 4)).toBe(OutcomeVerdict.Persisting);
    expect(judgeOutcome(0, 0)).toBe(OutcomeVerdict.Solved);
    expect(judgeOutcome(0, 1)).toBe(OutcomeVerdict.Persisting);
  });

  it('counts similar signals over equal windows before and after shipping', () => {
    const linked = signal('l1', 'Checkout times out for guests', -3, { opportunityId: 'opp-1' });
    const signals = [
      linked,
      signal('b1', 'Guest checkout timeout on mobile', -5),
      signal('b2', 'Mobile guest checkout times out again', -10),
      signal('old', 'Guest checkout timeout on mobile', -(OUTCOME_WINDOW_DAYS + 1)),
      signal('a1', 'Checkout times out for guests on mobile', 4),
      signal('other', 'Export invoices to CSV', 2),
      signal('late', 'Guest checkout timeout on mobile', OUTCOME_WINDOW_DAYS + 1),
    ];
    expect(assessOutcome(outcome(), OPPORTUNITY, signals)).toEqual({
      signalsBefore: 3,
      signalsAfter: 1,
      verdict: OutcomeVerdict.Solved,
    });
  });

  it('lists each untold customer once, with the links to their signals', () => {
    const told = new Date();
    expect(
      customersToTell([
        signal('s1', 'a', -1, { customer: 'Globex', url: 'https://t/1' }),
        signal('s2', 'b', -2, { customer: 'Globex' }),
        signal('s3', 'c', -3, { customer: 'Initech', url: 'https://t/3', toldAt: told }),
        signal('s4', 'd', -4),
        signal('s5', 'e', -5, { customer: 'Initech', url: 'https://t/5' }),
      ])
    ).toEqual([
      { customer: 'Globex', signalIds: ['s1', 's2'], urls: ['https://t/1'] },
      { customer: 'Initech', signalIds: ['s5'], urls: ['https://t/5'] },
    ]);
  });

  it('calibrates actual against estimated hours over outcomes that recorded them', () => {
    expect(
      calibrate([
        {
          estimatedHours: 4,
          outcome: outcome({ verdict: OutcomeVerdict.Solved, actualReviewHours: 6 }),
        },
        {
          estimatedHours: 6,
          outcome: outcome({ verdict: OutcomeVerdict.Persisting, actualReviewHours: 8 }),
        },
        { estimatedHours: 10, outcome: outcome({ verdict: OutcomeVerdict.Solved }) },
        { estimatedHours: 3, outcome: outcome() },
      ])
    ).toEqual({ judged: 3, solved: 2, timed: 2, hoursRatio: 1.4 });
    expect(calibrate([{ estimatedHours: 3, outcome: outcome() }])).toEqual({
      judged: 0,
      solved: 0,
      timed: 0,
    });
  });
});
