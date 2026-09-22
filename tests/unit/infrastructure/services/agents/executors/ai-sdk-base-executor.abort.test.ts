/**
 * AI SDK executors honour AgentExecutionOptions.abortSignal
 *
 * A parallel implement phase cancels its remaining calls when one fails. An
 * SDK request is not a process to kill, so the signal is handed to the SDK,
 * which cancels the HTTP request; the call fails as aborted, never as a
 * timeout, and is never retried.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { AiSdkBaseExecutorService } from '@/infrastructure/services/agents/common/executors/ai-sdk-base-executor.service.js';
import { classifyError } from '@/infrastructure/services/agents/feature-agent/nodes/agent-retry.js';

/** A provider call that only ends when its request is cancelled — like a hung HTTP call. */
function hangingModel(): MockLanguageModelV3 {
  const neverFinishes = (options: { abortSignal?: AbortSignal }) =>
    new Promise<never>((_, reject) => {
      const cancel = () =>
        reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
      // Like fetch: a signal that is already aborted cancels at once.
      if (options.abortSignal?.aborted) cancel();
      options.abortSignal?.addEventListener('abort', cancel);
    });
  return new MockLanguageModelV3({
    doGenerate: neverFinishes as never,
    doStream: neverFinishes as never,
  });
}

class TestSdkExecutor extends AiSdkBaseExecutorService {
  readonly agentType = 'openrouter' as never;
  constructor(private readonly model: MockLanguageModelV3) {
    super('key', 'TestProvider');
  }
  protected createModel(): LanguageModelV3 {
    return this.model;
  }
}

/** Resolves with the call's rejection, or 'still running' if it has not settled. */
async function outcomeSoon(call: Promise<unknown>): Promise<unknown> {
  const pending = new Promise((resolve) => setTimeout(() => resolve('still running'), 200));
  return Promise.race([
    call.then(
      () => 'resolved',
      (error: Error) => error
    ),
    pending,
  ]);
}

describe('AiSdkBaseExecutorService — abortSignal', () => {
  it('execute(): cancels the request and fails as aborted (non-retryable)', async () => {
    const controller = new AbortController();
    const call = new TestSdkExecutor(hangingModel()).execute('p', {
      abortSignal: controller.signal,
    });

    controller.abort();
    const outcome = await outcomeSoon(call);

    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/aborted/i);
    expect(classifyError((outcome as Error).message)).toBe('non-retryable');
  });

  it('executeStream(): cancels the request and fails as aborted', async () => {
    const controller = new AbortController();
    const consume = (async () => {
      for await (const _event of new TestSdkExecutor(hangingModel()).executeStream('p', {
        abortSignal: controller.signal,
      })) {
        // drain
      }
    })();

    controller.abort();
    const outcome = await outcomeSoon(consume);

    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/aborted/i);
  });
});
