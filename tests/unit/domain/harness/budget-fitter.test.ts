import { describe, it, expect } from 'vitest';
import { ChunkVisibility as V } from '@/domain/generated/output.js';
import { fitToBudget, type BudgetItem } from '@/domain/harness/budget-fitter.js';

function item(
  id: string,
  visibility: V,
  priority: number,
  tokens: [number, number, number],
  lock: BudgetItem['lock'] = 'none'
): BudgetItem {
  return {
    chunkId: id,
    visibility,
    priority,
    lock,
    tokens: { [V.Hidden]: 0, [V.Short]: tokens[0], [V.Long]: tokens[1], [V.Full]: tokens[2] },
  };
}

describe('fitToBudget', () => {
  it('changes nothing when the plan fits', () => {
    const r = fitToBudget([item('a', V.Full, 1, [10, 50, 100])], 500);
    expect(r.items[0]).toMatchObject({ visibility: V.Full, tokens: 100 });
    expect(r.items[0].reasonCode).toBeUndefined();
    expect(r.totalTokens).toBe(100);
    expect(r.overBudget).toBe(false);
  });

  it('downgrades the lowest-priority full chunk first', () => {
    const r = fitToBudget(
      [item('hi', V.Full, 0.9, [10, 50, 100]), item('lo', V.Full, 0.2, [10, 50, 100])],
      160
    );
    expect(r.items.find((i) => i.chunkId === 'lo')).toMatchObject({
      visibility: V.Long,
      reasonCode: 'budget_downgrade',
    });
    expect(r.items.find((i) => i.chunkId === 'hi')?.visibility).toBe(V.Full);
    expect(r.totalTokens).toBe(150);
  });

  it('downgrades full->long across all items before long->short', () => {
    const r = fitToBudget(
      [item('a', V.Full, 0.5, [10, 50, 100]), item('b', V.Long, 0.1, [10, 50, 100])],
      100
    );
    // a: full->long (100 -> 50) gives 100 total; fits without touching b
    expect(r.items.map((i) => i.visibility)).toEqual([V.Long, V.Long]);
    expect(r.totalTokens).toBe(100);
  });

  it('hides the lowest priority chunk when downgrades are not enough', () => {
    const r = fitToBudget(
      [item('a', V.Short, 0.9, [40, 50, 100]), item('b', V.Short, 0.1, [40, 50, 100])],
      50
    );
    expect(r.items.find((i) => i.chunkId === 'b')).toMatchObject({
      visibility: V.Hidden,
      reasonCode: 'budget_hidden',
      tokens: 0,
    });
    expect(r.totalTokens).toBe(40);
  });

  it('never downgrades or hides pinned chunks, even over budget', () => {
    const r = fitToBudget([item('pin', V.Full, 0, [10, 50, 100], 'pinned')], 20);
    expect(r.items[0]).toMatchObject({ visibility: V.Full, tokens: 100 });
    expect(r.overBudget).toBe(true);
  });

  it('may downgrade but never hides visible-locked chunks', () => {
    const r = fitToBudget([item('goal', V.Full, 0, [10, 50, 100], 'visible')], 5);
    expect(r.items[0].visibility).toBe(V.Short);
    expect(r.overBudget).toBe(true);
  });

  it('keeps hidden items hidden at zero cost', () => {
    const r = fitToBudget([item('x', V.Hidden, 0.5, [10, 50, 100])], 0);
    expect(r.items[0]).toMatchObject({ visibility: V.Hidden, tokens: 0 });
    expect(r.overBudget).toBe(false);
  });

  it('preserves input order in the output', () => {
    const r = fitToBudget(
      [item('1', V.Full, 0.1, [1, 2, 3]), item('2', V.Full, 0.9, [1, 2, 3])],
      100
    );
    expect(r.items.map((i) => i.chunkId)).toEqual(['1', '2']);
  });
});
