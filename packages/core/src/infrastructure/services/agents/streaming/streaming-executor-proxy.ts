/**
 * Streaming Executor Proxy
 *
 * Wraps an IAgentExecutor, transparently intercepting execute() calls
 * and routing them through executeStream(). Stream events are forwarded
 * to a shared EventChannel while the accumulated result is returned
 * to the caller (the graph node) as if execute() had been called normally.
 *
 * This allows graph nodes to remain unaware of streaming — they call
 * execute() and get an AgentExecutionResult back, while consumers of
 * the EventChannel receive real-time events.
 */

import type { AgentType, AgentFeature } from '@/domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import type { EventChannel } from './event-channel.js';

/**
 * The proxy exists specifically to surface streaming events to a channel,
 * so callers consuming the channel implicitly want per-token deltas (live
 * typing UX). Force `streamProgress: true` so the underlying executor
 * actually emits them — and so workers that bypass the proxy keep the
 * cheaper, delta-free behavior by default.
 */
function withStreamProgress(options?: AgentExecutionOptions): AgentExecutionOptions {
  return { ...options, streamProgress: true };
}

export class StreamingExecutorProxy implements IAgentExecutor {
  get agentType(): AgentType {
    return this.inner.agentType;
  }

  constructor(
    private readonly inner: IAgentExecutor,
    private readonly channel: EventChannel<AgentExecutionStreamEvent>
  ) {}

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    let result = '';

    try {
      for await (const event of this.inner.executeStream(prompt, withStreamProgress(options))) {
        this.channel.push(event);

        if (event.type === 'result') {
          result = event.content;
        }
      }
    } catch (error) {
      this.channel.push({
        type: 'error',
        content: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });
      this.channel.close();
      throw error;
    }

    this.channel.close();
    return { result };
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    yield* this.inner.executeStream(prompt, withStreamProgress(options));
  }

  supportsFeature(feature: AgentFeature): boolean {
    return this.inner.supportsFeature(feature);
  }
}
