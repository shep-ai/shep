import { describe, it, expect } from 'vitest';
import {
  LedgerIdentityError,
  RefinementLedger,
  expectedRollouts,
  expectedSessions,
} from '@/domain/harness-learning/refinement-ledger.js';
import { HarnessRecursion } from '@/domain/generated/output.js';

function fill(ledger: RefinementLedger, k: number): void {
  for (let i = 0; i < 4 * k; i++) ledger.rollout(`r${i}`, 1);
  for (let i = 0; i < 3 * k; i++) ledger.session(`s${i}`, 0.5);
}

describe('RefinementLedger', () => {
  it('expects 4k rollouts and 3k sessions', () => {
    expect(expectedRollouts(3)).toBe(12);
    expect(expectedSessions(3)).toBe(9);
  });

  it.each([1, 2, 3, 4, 5])('balances at k=%i in both recursion shapes', (k) => {
    for (const recursion of [HarnessRecursion.Parallel, HarnessRecursion.Sequential]) {
      const ledger = new RefinementLedger(recursion, k);
      fill(ledger, k);
      expect(() => ledger.assertIdentity()).not.toThrow();
      expect(ledger.rollouts).toBe(4 * k);
      expect(ledger.sessions).toBe(3 * k);
      expect(ledger.costUsd).toBeCloseTo(4 * k + 1.5 * k);
    }
  });

  it('throws on a miscount, naming what is off', () => {
    const ledger = new RefinementLedger(HarnessRecursion.Parallel, 1);
    fill(ledger, 1);
    ledger.rollout('extra');
    expect(() => ledger.assertIdentity()).toThrow(LedgerIdentityError);
    expect(() => ledger.assertIdentity()).toThrow(/5 rollouts, expected 4/);
  });

  it('reports when the cost cap is reached', () => {
    const ledger = new RefinementLedger(HarnessRecursion.Parallel, 1);
    ledger.rollout('base1', 3);
    expect(ledger.isOverBudget(5)).toBe(false);
    ledger.session('inv1', 2);
    expect(ledger.isOverBudget(5)).toBe(true);
  });

  it('ignores negative or non-finite costs', () => {
    const ledger = new RefinementLedger(HarnessRecursion.Parallel, 1);
    ledger.rollout('a', Number.NaN);
    ledger.session('b', -3);
    expect(ledger.costUsd).toBe(0);
  });

  it('refuses a non-positive k', () => {
    expect(() => new RefinementLedger(HarnessRecursion.Parallel, 0)).toThrow(/k must be/);
  });
});
