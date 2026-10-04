import { describe, it, expect } from 'vitest';
import { MAX_BRIEF_SIGNALS, opportunityBrief } from '@/domain/shared/opportunity-brief.js';
import { evidenceOf } from '@/domain/shared/opportunity-score.js';
import {
  OpportunityStatus,
  SignalKind,
  type Opportunity,
  type Signal,
} from '@/domain/generated/output.js';

const T = new Date('2026-10-05T10:00:00Z');
const BET: Opportunity = {
  id: 'o',
  spaceId: 's',
  title: 'Faster checkout',
  problem: 'Guests abandon checkout.',
  status: OpportunityStatus.Accepted,
  reviewHours: 6,
  confidence: 0.7,
  strategic: false,
  createdAt: T,
  updatedAt: T,
};

function signal(n: number, extra: Partial<Signal> = {}): Signal {
  return {
    id: `s${n}`,
    spaceId: 's',
    kind: SignalKind.Feedback,
    title: `Signal ${n}`,
    urgent: false,
    createdAt: T,
    updatedAt: T,
    ...extra,
  };
}

describe('opportunityBrief', () => {
  it('carries the problem, the numbers and the evidence', () => {
    const signals = [
      signal(1, {
        customer: 'Globex',
        monthlyRevenue: 4000,
        urgent: true,
        url: 'https://support.acme.com/t/1',
        detail: 'Times out\nafter 30s',
      }),
    ];
    const brief = opportunityBrief(BET, signals, evidenceOf(signals));
    expect(brief).toContain('## Problem\n\nGuests abandon checkout.');
    expect(brief).toContain('- 1 signal(s) from 1 customer(s)');
    expect(brief).toContain('- Review estimate: 6 h at 70% confidence');
    expect(brief).toContain(
      '- Signal 1 (https://support.acme.com/t/1) [Feedback, Globex, 4000/month, urgent] — Times out after 30s'
    );
  });

  it('quotes a bounded number of signals and counts the rest', () => {
    const signals = Array.from({ length: MAX_BRIEF_SIGNALS + 2 }, (_, n) => signal(n));
    const brief = opportunityBrief({ ...BET, problem: undefined }, signals, evidenceOf(signals));
    expect(brief).not.toContain('## Problem');
    expect(brief).toContain('…and 2 more');
    expect(brief).not.toContain(`Signal ${MAX_BRIEF_SIGNALS}`);
  });
});
