import { describe, it, expect } from 'vitest';
import { anonymousId, assignAnonymousIds } from '@/domain/harness-learning/anonymize-candidates.js';

describe('anonymousId', () => {
  it('counts A..Z, then AA, AB', () => {
    expect(anonymousId(0)).toBe('A');
    expect(anonymousId(25)).toBe('Z');
    expect(anonymousId(26)).toBe('AA');
    expect(anonymousId(27)).toBe('AB');
  });
});

describe('assignAnonymousIds', () => {
  const labels = ['agg1', 'agg2', 'agg3', 'agg4', 'agg5'];

  it('maps every label to exactly one id', () => {
    const map = assignAnonymousIds(labels, 'feat-1|5|parallel');
    expect(Object.keys(map).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(Object.values(map).sort()).toEqual(labels);
  });

  it('is stable for the same seed and input order', () => {
    expect(assignAnonymousIds(labels, 'feat-1|5|parallel')).toEqual(
      assignAnonymousIds([...labels].reverse(), 'feat-1|5|parallel')
    );
  });

  it('shuffles differently for a different seed', () => {
    const orders = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => JSON.stringify(assignAnonymousIds(labels, seed)))
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
