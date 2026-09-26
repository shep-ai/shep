/**
 * withFailureReason unit tests
 *
 * When setup fails at boot (agent not logged in, CLI missing, …) the real
 * reason is recorded on the failed workflow step. The recovery banner should
 * say it, not just "Setup failed".
 */

import { describe, it, expect } from 'vitest';

import { withFailureReason } from '@/components/features/chat/failure-reason';
import type { EnhancedStepState } from '@/components/features/chat/useChatRuntime';
import type { ApplicationErrorState } from '@/components/features/chat/error-recovery-banner';

const SETUP_FAILED: ApplicationErrorState = {
  kind: 'Setup failed',
  message: 'The last setup run errored out before it could finish.',
  retryable: true,
};

function step(
  status: EnhancedStepState['status'],
  error?: string,
  finishedAt: number | null = null
): EnhancedStepState {
  return {
    definition: { id: `s-${status}-${finishedAt}`, stepKey: 'k', title: 't', description: '' },
    status,
    metadata: error ? { error } : null,
    toolMessages: [],
    startedAt: null,
    finishedAt,
  };
}

describe('withFailureReason', () => {
  it('adds the failed step error as the banner detail', () => {
    const result = withFailureReason(SETUP_FAILED, [
      step('done'),
      step('failed', 'cursor-agent is not logged in', 2),
    ]);

    expect(result).toEqual({ ...SETUP_FAILED, detail: 'cursor-agent is not logged in' });
  });

  it('uses the most recently finished failed step', () => {
    const result = withFailureReason(SETUP_FAILED, [
      step('failed', 'older failure', 1),
      step('failed', 'newest failure', 5),
    ]);

    expect(result?.detail).toBe('newest failure');
  });

  it('leaves the banner unchanged when no failed step has a reason', () => {
    expect(withFailureReason(SETUP_FAILED, [step('failed')])).toBe(SETUP_FAILED);
    expect(withFailureReason(SETUP_FAILED, [])).toBe(SETUP_FAILED);
  });

  it('keeps an existing detail and passes null through', () => {
    const withDetail = { ...SETUP_FAILED, detail: 'already set' };
    expect(withFailureReason(withDetail, [step('failed', 'other', 1)])).toBe(withDetail);
    expect(withFailureReason(null, [step('failed', 'x', 1)])).toBeNull();
  });
});
