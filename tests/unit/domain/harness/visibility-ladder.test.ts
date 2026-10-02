import { describe, it, expect } from 'vitest';
import { ChunkVisibility } from '@/domain/generated/output.js';
import {
  compareVisibility,
  downgradeVisibility,
  escalateVisibility,
  maxVisibility,
  visibilityForScore,
} from '@/domain/harness/visibility-ladder.js';

const bands = {
  hideThreshold: 0.1,
  longThreshold: 0.45,
  fullThreshold: 0.8,
  uncertainDefault: ChunkVisibility.Long,
};

describe('visibility ladder', () => {
  it('orders hidden < short < long < full', () => {
    expect(compareVisibility(ChunkVisibility.Hidden, ChunkVisibility.Short)).toBeLessThan(0);
    expect(compareVisibility(ChunkVisibility.Full, ChunkVisibility.Long)).toBeGreaterThan(0);
    expect(compareVisibility(ChunkVisibility.Long, ChunkVisibility.Long)).toBe(0);
  });

  it('escalates one level and stops at full', () => {
    expect(escalateVisibility(ChunkVisibility.Hidden)).toBe(ChunkVisibility.Short);
    expect(escalateVisibility(ChunkVisibility.Short)).toBe(ChunkVisibility.Long);
    expect(escalateVisibility(ChunkVisibility.Long)).toBe(ChunkVisibility.Full);
    expect(escalateVisibility(ChunkVisibility.Full)).toBe(ChunkVisibility.Full);
  });

  it('downgrades one level and stops at hidden', () => {
    expect(downgradeVisibility(ChunkVisibility.Full)).toBe(ChunkVisibility.Long);
    expect(downgradeVisibility(ChunkVisibility.Hidden)).toBe(ChunkVisibility.Hidden);
  });

  it('returns the more visible of two levels', () => {
    expect(maxVisibility(ChunkVisibility.Short, ChunkVisibility.Long)).toBe(ChunkVisibility.Long);
  });

  it.each([
    [0, ChunkVisibility.Hidden],
    [0.09, ChunkVisibility.Hidden],
    [0.1, ChunkVisibility.Short],
    [0.44, ChunkVisibility.Short],
    [0.45, ChunkVisibility.Long],
    [0.79, ChunkVisibility.Long],
    [0.8, ChunkVisibility.Full],
    [1, ChunkVisibility.Full],
  ])('maps score %s to %s', (score, expected) => {
    expect(visibilityForScore(score, bands)).toBe(expected);
  });

  it('uses the uncertain default when there is no score', () => {
    expect(visibilityForScore(undefined, bands)).toBe(ChunkVisibility.Long);
  });
});
