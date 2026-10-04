import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OPPORTUNITY_WEIGHTS,
  MIN_REVIEW_HOURS,
  drawLine,
  evidenceOf,
  rankOpportunities,
  scoreOpportunity,
} from '@/domain/shared/opportunity-score.js';
import {
  OpportunityStatus,
  SignalKind,
  type Opportunity,
  type Signal,
} from '@/domain/generated/output.js';

const T = new Date('2026-10-05T10:00:00Z');
const WEIGHTS = { reach: 1, revenue: 2, urgency: 3, strategic: 5, weeklyReviewHours: 10 };

function signal(extra: Partial<Signal> = {}): Signal {
  return {
    id: `sig-${Math.random()}`,
    spaceId: 's',
    kind: SignalKind.Feedback,
    title: 'Checkout is slow',
    urgent: false,
    createdAt: T,
    updatedAt: T,
    ...extra,
  };
}

function opportunity(id: string, extra: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    spaceId: 's',
    title: id,
    status: OpportunityStatus.Accepted,
    reviewHours: 4,
    confidence: 1,
    strategic: false,
    createdAt: T,
    updatedAt: T,
    ...extra,
  };
}

describe('evidenceOf', () => {
  it('counts named customers once, with their largest revenue, and anonymous signals each', () => {
    const evidence = evidenceOf([
      signal({ customer: 'Globex', monthlyRevenue: 1000 }),
      signal({ customer: ' globex ', monthlyRevenue: 4000, urgent: true }),
      signal({ customer: 'Initech', monthlyRevenue: 500 }),
      signal(),
      signal({ customer: '  ' }),
    ]);
    expect(evidence).toEqual({ signals: 5, customers: 4, revenueAtStake: 4500, urgentSignals: 1 });
  });
});

describe('scoreOpportunity', () => {
  it('is value times confidence per review hour', () => {
    const scored = scoreOpportunity(
      opportunity('o', { reviewHours: 2, confidence: 0.5, strategic: true }),
      [signal({ customer: 'Globex', monthlyRevenue: 3000, urgent: true })],
      WEIGHTS
    );
    // 1×1 customer + 2×3 revenue units + 3×1 urgent + 5 strategic = 15
    expect(scored.value).toBe(15);
    expect(scored.score).toBe(3.75);
  });

  it('never divides by less than the minimum review estimate', () => {
    const scored = scoreOpportunity(opportunity('o', { reviewHours: 0 }), [signal()], WEIGHTS);
    expect(scored.score).toBe(1 / MIN_REVIEW_HOURS);
  });

  it('has sensible defaults', () => {
    expect(DEFAULT_OPPORTUNITY_WEIGHTS.weeklyReviewHours).toBeGreaterThan(0);
  });
});

describe('rankOpportunities', () => {
  it('ranks by score, then cheaper review, then age', () => {
    const later = new Date(T.getTime() + 1000);
    const ranked = rankOpportunities([
      scoreOpportunity(opportunity('low', { reviewHours: 8 }), [signal()], WEIGHTS),
      scoreOpportunity(opportunity('young', { createdAt: later }), [signal()], WEIGHTS),
      scoreOpportunity(opportunity('old'), [signal()], WEIGHTS),
      scoreOpportunity(opportunity('high', { reviewHours: 1 }), [signal()], WEIGHTS),
    ]);
    expect(ranked.map((s) => s.opportunity.id)).toEqual(['high', 'old', 'young', 'low']);
  });
});

describe('drawLine', () => {
  it('keeps building work first, then fits accepted bets best-first', () => {
    const line = drawLine(
      [
        scoreOpportunity(
          opportunity('building', { status: OpportunityStatus.Building, reviewHours: 3 }),
          [],
          WEIGHTS
        ),
        scoreOpportunity(
          opportunity('best', { reviewHours: 4 }),
          [signal(), signal(), signal()],
          WEIGHTS
        ),
        scoreOpportunity(opportunity('too-big', { reviewHours: 6 }), [signal(), signal()], WEIGHTS),
        scoreOpportunity(opportunity('small', { reviewHours: 2 }), [signal()], WEIGHTS),
        scoreOpportunity(
          opportunity('proposed', { status: OpportunityStatus.Proposed }),
          [signal()],
          WEIGHTS
        ),
      ],
      10
    );
    expect(line.inLine.map((s) => s.opportunity.id)).toEqual(['building', 'best', 'small']);
    expect(line.waiting.map((s) => s.opportunity.id)).toEqual(['too-big']);
    expect(line.usedHours).toBe(9);
    expect(line.capacityHours).toBe(10);
  });
});
