/**
 * Harness task state machine (spec 119, spec/state-machines/task.md).
 *
 * Terminal states never move back to running: a retry is a new task.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import { HarnessTaskStatus } from '../generated/output';

const TRANSITIONS: Readonly<Record<HarnessTaskStatus, readonly HarnessTaskStatus[]>> = {
  [HarnessTaskStatus.Pending]: [HarnessTaskStatus.Running, HarnessTaskStatus.Cancelled],
  [HarnessTaskStatus.Running]: [
    HarnessTaskStatus.Blocked,
    HarnessTaskStatus.Completed,
    HarnessTaskStatus.Failed,
    HarnessTaskStatus.Cancelled,
  ],
  [HarnessTaskStatus.Blocked]: [
    HarnessTaskStatus.Running,
    HarnessTaskStatus.Failed,
    HarnessTaskStatus.Cancelled,
  ],
  [HarnessTaskStatus.Completed]: [],
  [HarnessTaskStatus.Failed]: [],
  [HarnessTaskStatus.Cancelled]: [],
};

/** Thrown when code tries to move a harness task along an illegal edge. */
export class InvalidHarnessTaskTransitionError extends Error {
  constructor(
    readonly from: HarnessTaskStatus,
    readonly to: HarnessTaskStatus
  ) {
    super(`Illegal harness task transition: ${from} -> ${to}`);
    this.name = 'InvalidHarnessTaskTransitionError';
  }
}

export function canTransitionHarnessTask(from: HarnessTaskStatus, to: HarnessTaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertHarnessTaskTransition(from: HarnessTaskStatus, to: HarnessTaskStatus): void {
  if (!canTransitionHarnessTask(from, to)) {
    throw new InvalidHarnessTaskTransitionError(from, to);
  }
}

export function isTerminalHarnessTaskStatus(status: HarnessTaskStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
