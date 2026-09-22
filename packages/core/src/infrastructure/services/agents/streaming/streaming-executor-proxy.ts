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
import { TURN_CUT_SHORT_CLAUSE } from '../common/executors/process-stream.js';

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

/** Reported when an agent stream ended without the event that carries its answer. */
const NO_RESULT_EVENT_MESSAGE = `Agent stream ended without a result event — ${TURN_CUT_SHORT_CLAUSE}`;

export class StreamingExecutorProxy implements IAgentExecutor {
  get agentType(): AgentType {
    return this.inner.agentType;
  }

  constructor(
    private readonly inner: IAgentExecutor,
    private readonly channel: EventChannel<AgentExecutionStreamEvent>
  ) {}

  /**
   * Run one graph node's call through the stream and return its result.
   *
   * The outcome rule fails closed. Subprocess executors report timeouts,
   * non-zero exits and signal kills as an `error` event and then END the
   * stream rather than throwing, so the LAST outcome event decides: an `error`
   * after (or without) a `result` rejects with its content, and a stream that
   * ends with neither was cut short, not answered. A `result` after an `error`
   * still wins — CLIs report recoverable trouble (Codex "Reconnecting… 1/5")
   * as an error event mid-turn and then finish the turn.
   *
   * The channel is shared by every node of the graph and is closed once, by
   * whoever owns the run (AgentRunnerService); closing it here dropped every
   * later node's events.
   */
  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    /** The last `result` or `error` event — the one that decides the outcome. */
    let outcome: AgentExecutionStreamEvent | undefined;

    try {
      for await (const event of this.inner.executeStream(prompt, withStreamProgress(options))) {
        this.channel.push(event);
        if (event.type === 'result' || event.type === 'error') outcome = event;
      }
    } catch (error) {
      this.channel.push({
        type: 'error',
        content: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });
      throw error;
    }

    if (outcome?.type === 'error') throw new Error(outcome.content);

    if (!outcome) {
      this.channel.push({ type: 'error', content: NO_RESULT_EVENT_MESSAGE, timestamp: new Date() });
      throw new Error(NO_RESULT_EVENT_MESSAGE);
    }

    // The id identifies the conversation, so it travels beside the answer
    // rather than inside it — otherwise a caller resuming a session would
    // have to guess which of the two `content` holds.
    const result = outcome.content;
    return outcome.sessionId ? { result, sessionId: outcome.sessionId } : { result };
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
