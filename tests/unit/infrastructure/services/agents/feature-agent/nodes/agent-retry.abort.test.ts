/**
 * retryExecute and an aborted caller
 *
 * A parallel implement phase aborts its remaining tasks when one fails. A task
 * sitting in its retry back-off must not start another attempt afterwards, and
 * an aborted attempt is never retried.
 */

import { describe, it, expect, vi } from 'vitest';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import {
  classifyError,
  retryExecute,
} from '@/infrastructure/services/agents/feature-agent/nodes/agent-retry.js';
import { AGENT_ABORTED_MESSAGE } from '@/infrastructure/services/agents/common/executors/process-stream.js';

function executorFailingWith(message: string): IAgentExecutor {
  return {
    agentType: 'claude-code',
    execute: vi.fn().mockRejectedValue(new Error(message)),
    executeStream: vi.fn(),
    supportsFeature: vi.fn(),
  } as unknown as IAgentExecutor;
}

describe('retryExecute — abort', () => {
  it('classifies an aborted run as non-retryable', () => {
    expect(classifyError(AGENT_ABORTED_MESSAGE)).toBe('non-retryable');
  });

  it('does not start another attempt once the caller has aborted', async () => {
    const controller = new AbortController();
    const executor = executorFailingWith('API Error: 529 overloaded');
    vi.mocked(executor.execute).mockImplementationOnce(async () => {
      // The sibling fails while this attempt is in flight.
      controller.abort();
      throw new Error('API Error: 529 overloaded');
    });

    await expect(
      retryExecute(executor, 'p', { abortSignal: controller.signal }, { baseDelayMs: 1 })
    ).rejects.toThrow(AGENT_ABORTED_MESSAGE);
    expect(executor.execute).toHaveBeenCalledOnce();
  });

  it('does not start at all with an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const executor = executorFailingWith('never');

    await expect(retryExecute(executor, 'p', { abortSignal: controller.signal })).rejects.toThrow(
      AGENT_ABORTED_MESSAGE
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
