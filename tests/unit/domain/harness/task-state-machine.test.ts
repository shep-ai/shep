import { describe, it, expect } from 'vitest';
import { HarnessTaskStatus as S } from '@/domain/generated/output.js';
import {
  assertHarnessTaskTransition,
  canTransitionHarnessTask,
  InvalidHarnessTaskTransitionError,
  isTerminalHarnessTaskStatus,
} from '@/domain/harness/task-state-machine.js';

const legal: [S, S][] = [
  [S.Pending, S.Running],
  [S.Pending, S.Cancelled],
  [S.Running, S.Blocked],
  [S.Running, S.Completed],
  [S.Running, S.Failed],
  [S.Running, S.Cancelled],
  [S.Blocked, S.Running],
  [S.Blocked, S.Failed],
  [S.Blocked, S.Cancelled],
];

const all = Object.values(S);

describe('harness task state machine', () => {
  it.each(legal)('allows %s -> %s', (from, to) => {
    expect(canTransitionHarnessTask(from, to)).toBe(true);
    expect(() => assertHarnessTaskTransition(from, to)).not.toThrow();
  });

  const illegal = all.flatMap((from) =>
    all
      .filter((to) => !legal.some(([f, t]) => f === from && t === to))
      .map((to) => [from, to] as [S, S])
  );

  it.each(illegal)('rejects %s -> %s', (from, to) => {
    expect(canTransitionHarnessTask(from, to)).toBe(false);
    expect(() => assertHarnessTaskTransition(from, to)).toThrow(InvalidHarnessTaskTransitionError);
  });

  it('marks completed, failed and cancelled as terminal', () => {
    expect(all.filter(isTerminalHarnessTaskStatus).sort()).toEqual(
      [S.Cancelled, S.Completed, S.Failed].sort()
    );
  });
});
