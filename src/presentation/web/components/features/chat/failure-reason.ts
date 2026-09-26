/**
 * Attach the real failure reason to a recovery banner.
 *
 * When setup fails at boot — agent not logged in, CLI missing or too old —
 * the orchestrator records the error on the failed workflow step. Surfacing
 * it in the banner tells the user what to fix before pressing "Try again".
 * Pure: derived from the step list on every render.
 */

import type { ApplicationErrorState } from './ChatTab';
import type { EnhancedStepState } from './useChatRuntime';

const ERROR_METADATA_KEY = 'error';

function stepError(step: EnhancedStepState): string | undefined {
  const value = step.metadata?.[ERROR_METADATA_KEY];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Error of the most recently finished failed step, if it recorded one. */
function latestFailureReason(steps: EnhancedStepState[]): string | undefined {
  const failed = steps
    .filter((step) => step.status === 'failed' && stepError(step))
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  return failed[0] ? stepError(failed[0]) : undefined;
}

export function withFailureReason(
  state: ApplicationErrorState | null,
  steps: EnhancedStepState[]
): ApplicationErrorState | null {
  if (!state || state.detail) return state;
  const reason = latestFailureReason(steps);
  return reason ? { ...state, detail: reason } : state;
}
