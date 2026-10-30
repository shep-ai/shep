import { describe, it, expect } from 'vitest';
import { compareToParent, summarizeOutcomes } from '@/domain/harness-learning/version-metrics.js';
import { HarnessVersionTrend, type HarnessVersionOutcome } from '@/domain/generated/output.js';

function outcome(over: Partial<HarnessVersionOutcome> = {}): HarnessVersionOutcome {
  return {
    id: 'o',
    versionId: 'v',
    featureId: 'f',
    ciFixAttempts: 1,
    gateRejections: 0,
    validationRepairs: 0,
    numTurns: 40,
    costUsd: 2,
    merged: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
}

const many = (n: number, over: Partial<HarnessVersionOutcome> = {}) =>
  Array.from({ length: n }, () => outcome(over));

describe('summarizeOutcomes', () => {
  it('averages every metric and the merge rate', () => {
    const s = summarizeOutcomes([
      outcome({ ciFixAttempts: 0, merged: true, costUsd: 1 }),
      outcome({ ciFixAttempts: 2, merged: false, costUsd: 3 }),
    ]);
    expect(s.count).toBe(2);
    expect(s.meanCiFixAttempts).toBe(1);
    expect(s.mergeRate).toBe(0.5);
    expect(s.meanCostUsd).toBe(2);
  });

  it('handles no outcomes', () => {
    expect(summarizeOutcomes([]).count).toBe(0);
  });
});

describe('compareToParent', () => {
  it('needs the minimum sample on both sides', () => {
    expect(compareToParent(many(4), many(9), 5).trend).toBe(HarnessVersionTrend.InsufficientData);
    expect(compareToParent(many(9), many(4), 5).trend).toBe(HarnessVersionTrend.InsufficientData);
  });

  it('flags a clearly worse child as regressed', () => {
    const worse = many(6, { ciFixAttempts: 4, gateRejections: 2, merged: false });
    expect(compareToParent(worse, many(6), 5).trend).toBe(HarnessVersionTrend.Regressed);
  });

  it('calls a clearly better child improved and an equal one unchanged', () => {
    const better = many(6, { ciFixAttempts: 0, numTurns: 20 });
    expect(compareToParent(better, many(6, { ciFixAttempts: 3 }), 5).trend).toBe(
      HarnessVersionTrend.Improved
    );
    expect(compareToParent(many(6), many(6), 5).trend).toBe(HarnessVersionTrend.Unchanged);
  });
});
