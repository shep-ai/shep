import { describe, it, expect } from 'vitest';
import { MAX_DISCOVERY_PROPOSALS, checkProposals } from '@/domain/shared/discovery-proposals.js';
import { MAX_REVIEW_HOURS, MIN_REVIEW_HOURS } from '@/domain/shared/opportunity-score.js';

const LOOSE = new Set(['s1', 's2', 's3']);

describe('checkProposals', () => {
  it('keeps proposals citing loose signals, with outline and rationale as the brief', () => {
    const { kept, dropped } = checkProposals(
      [
        {
          title: '  Faster guest checkout ',
          problem: 'Guests abandon checkout.',
          outline: 'Cache the session lookup.',
          rationale: 'Three customers, one urgent.',
          signalIds: ['s1', 's2', 's2', 'linked-elsewhere'],
          reviewHours: 6,
          confidence: 0.7,
        },
      ],
      LOOSE,
      []
    );
    expect(dropped).toBe(0);
    expect(kept).toEqual([
      {
        title: 'Faster guest checkout',
        problem: 'Guests abandon checkout.',
        brief: 'Cache the session lookup.\n\nThree customers, one urgent.',
        signalIds: ['s1', 's2'],
        reviewHours: 6,
        confidence: 0.7,
      },
    ]);
  });

  it('drops proposals without real signals, without a title, or repeating a title', () => {
    const { kept, dropped } = checkProposals(
      [
        { title: 'Invented', signalIds: ['nope'] },
        { title: '', signalIds: ['s1'] },
        { title: 'Dark Mode', signalIds: ['s1'] },
        { title: 'Exports', signalIds: ['s2'] },
        { title: 'exports', signalIds: ['s3'] },
        { title: 'No list', signalIds: 's1' },
      ],
      LOOSE,
      ['dark   mode']
    );
    expect(kept.map((p) => p.title)).toEqual(['Exports']);
    expect(dropped).toBe(5);
  });

  it('clamps estimates and keeps at most the proposal limit', () => {
    const many = Array.from({ length: MAX_DISCOVERY_PROPOSALS + 2 }, (_, n) => ({
      title: `Bet ${n}`,
      signalIds: ['s1'],
      reviewHours: n === 0 ? 10_000 : n === 1 ? 0 : 'soon',
      confidence: n === 0 ? 3 : -1,
    }));
    const { kept, dropped } = checkProposals(many, LOOSE, []);
    expect(kept).toHaveLength(MAX_DISCOVERY_PROPOSALS);
    expect(dropped).toBe(2);
    expect(kept[0]).toMatchObject({ reviewHours: MAX_REVIEW_HOURS, confidence: 1 });
    expect(kept[1]).toMatchObject({ reviewHours: MIN_REVIEW_HOURS, confidence: 0 });
    expect(kept[2].reviewHours).toBeGreaterThan(MIN_REVIEW_HOURS);
  });
});
