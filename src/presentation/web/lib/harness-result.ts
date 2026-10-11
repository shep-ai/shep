import { attemptResult, type ActionResult } from './action-outcome';

/** Result envelope of the harness server actions (spec 119). */
export type HarnessResult<T> = ActionResult<T>;

export const toHarnessResult = attemptResult;
