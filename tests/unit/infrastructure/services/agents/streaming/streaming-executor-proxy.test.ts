/**
 * StreamingExecutorProxy Unit Tests
 *
 * Verifies the proxy intercepts execute() calls and routes them
 * through executeStream(), forwarding events to an EventChannel.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentType, AgentFeature } from '@/domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionStreamEvent,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import { EventChannel } from '@/infrastructure/services/agents/streaming/event-channel.js';
import { StreamingExecutorProxy } from '@/infrastructure/services/agents/streaming/streaming-executor-proxy.js';

/** Helper to create a mock executor with a predefined stream sequence. */
function createMockExecutor(streamEvents: AgentExecutionStreamEvent[]): IAgentExecutor {
  return {
    agentType: AgentType.ClaudeCode,
    execute: vi.fn().mockResolvedValue({ result: 'should not be called' }),
    async *executeStream() {
      for (const event of streamEvents) {
        yield event;
      }
    },
    supportsFeature: vi.fn().mockReturnValue(true),
  };
}

function makeEvent(
  type: 'progress' | 'result' | 'error',
  content: string
): AgentExecutionStreamEvent {
  return { type, content, timestamp: new Date() };
}

describe('StreamingExecutorProxy', () => {
  let channel: EventChannel<AgentExecutionStreamEvent>;

  beforeEach(() => {
    channel = new EventChannel<AgentExecutionStreamEvent>();
  });

  describe('execute()', () => {
    it('should call inner.executeStream() instead of inner.execute()', async () => {
      const events = [makeEvent('result', 'done')];
      const inner = createMockExecutor(events);
      const executeStreamSpy = vi.spyOn(inner, 'executeStream');
      const proxy = new StreamingExecutorProxy(inner, channel);

      // Start consuming channel in background so it doesn't block
      const consumer = (async () => {
        for await (const _event of channel) {
          /* drain */
        }
      })();

      await proxy.execute('test prompt', { cwd: '/repo' });

      expect(inner.execute).not.toHaveBeenCalled();
      expect(executeStreamSpy).toHaveBeenCalledWith('test prompt', {
        cwd: '/repo',
        streamProgress: true,
      });

      channel.close();
      await consumer;
    });

    it('should inject streamProgress=true even when caller passes no options', async () => {
      const events = [makeEvent('result', 'done')];
      const inner = createMockExecutor(events);
      const executeStreamSpy = vi.spyOn(inner, 'executeStream');
      const proxy = new StreamingExecutorProxy(inner, channel);

      const consumer = (async () => {
        for await (const _event of channel) {
          /* drain */
        }
      })();

      await proxy.execute('test prompt');

      expect(executeStreamSpy).toHaveBeenCalledWith('test prompt', { streamProgress: true });

      channel.close();
      await consumer;
    });

    it('should preserve streamProgress=true even when caller explicitly sets it to false', async () => {
      const events = [makeEvent('result', 'done')];
      const inner = createMockExecutor(events);
      const executeStreamSpy = vi.spyOn(inner, 'executeStream');
      const proxy = new StreamingExecutorProxy(inner, channel);

      const consumer = (async () => {
        for await (const _event of channel) {
          /* drain */
        }
      })();

      await proxy.execute('test prompt', { streamProgress: false });

      expect(executeStreamSpy).toHaveBeenCalledWith('test prompt', { streamProgress: true });

      channel.close();
      await consumer;
    });

    it('should forward each stream event to the EventChannel', async () => {
      const events = [
        makeEvent('progress', 'Working...'),
        makeEvent('progress', 'Still going...'),
        makeEvent('result', 'Final answer'),
      ];
      const inner = createMockExecutor(events);
      const proxy = new StreamingExecutorProxy(inner, channel);

      const collected: AgentExecutionStreamEvent[] = [];
      const consumer = (async () => {
        for await (const event of channel) {
          collected.push(event);
        }
      })();

      await proxy.execute('prompt');

      channel.close();
      await consumer;

      expect(collected).toHaveLength(3);
      expect(collected[0].type).toBe('progress');
      expect(collected[0].content).toBe('Working...');
      expect(collected[1].content).toBe('Still going...');
      expect(collected[2].type).toBe('result');
      expect(collected[2].content).toBe('Final answer');
    });

    it('should return accumulated result from last result event', async () => {
      const events = [
        makeEvent('progress', 'Working...'),
        makeEvent('result', 'The final result text'),
      ];
      const inner = createMockExecutor(events);
      const proxy = new StreamingExecutorProxy(inner, channel);

      const consumer = (async () => {
        for await (const _event of channel) {
          /* drain */
        }
      })();

      const result = await proxy.execute('prompt');

      channel.close();
      await consumer;

      expect(result.result).toBe('The final result text');
    });

    it('should carry a session id reported by the result event', async () => {
      const inner = createMockExecutor([
        {
          type: 'result',
          content: 'The answer is 42.',
          timestamp: new Date(),
          sessionId: 'sess-9',
        },
      ]);
      const proxy = new StreamingExecutorProxy(inner, channel);

      const consumer = (async () => {
        for await (const _event of channel) {
          /* drain */
        }
      })();

      const result = await proxy.execute('prompt');
      channel.close();
      await consumer;

      // Without this the session is unresumable through the proxy, and the
      // temptation is to smuggle the id through `content` — which is the answer.
      expect(result.result).toBe('The answer is 42.');
      expect(result.sessionId).toBe('sess-9');
    });

    it('should omit sessionId when the agent reported none', async () => {
      const inner = createMockExecutor([makeEvent('result', 'done')]);
      const proxy = new StreamingExecutorProxy(inner, channel);

      const consumer = (async () => {
        for await (const _event of channel) {
          /* drain */
        }
      })();

      const result = await proxy.execute('prompt');
      channel.close();
      await consumer;

      expect(result).not.toHaveProperty('sessionId');
    });

    it('should push error event and re-throw on stream failure', async () => {
      const failingExecutor: IAgentExecutor = {
        agentType: AgentType.ClaudeCode,
        execute: vi.fn(),
        async *executeStream() {
          yield makeEvent('progress', 'Starting...');
          throw new Error('Stream exploded');
        },
        supportsFeature: vi.fn(),
      };
      const proxy = new StreamingExecutorProxy(failingExecutor, channel);

      const collected: AgentExecutionStreamEvent[] = [];
      const consumer = (async () => {
        for await (const event of channel) {
          collected.push(event);
        }
      })();

      await expect(proxy.execute('prompt')).rejects.toThrow('Stream exploded');

      channel.close();
      await consumer;

      expect(collected.some((e) => e.type === 'error')).toBe(true);
      const errorEvent = collected.find((e) => e.type === 'error');
      expect(errorEvent!.content).toBe('Stream exploded');
    });

    it('should reject with the content of an error event after forwarding it', async () => {
      // Subprocess executors report timeouts, non-zero exits and signal kills as
      // an error event and then end the stream — they never throw.
      const inner = createMockExecutor([
        makeEvent('progress', 'Working...'),
        makeEvent('error', 'Agent execution timed out after 300s'),
      ]);
      const proxy = new StreamingExecutorProxy(inner, channel);

      const collected: AgentExecutionStreamEvent[] = [];
      const consumer = (async () => {
        for await (const event of channel) {
          collected.push(event);
        }
      })();

      await expect(proxy.execute('prompt')).rejects.toThrow('Agent execution timed out after 300s');
      channel.close();
      await consumer;

      // Forwarded exactly once — not re-pushed by the catch block.
      const errors = collected.filter((e) => e.type === 'error');
      expect(errors).toHaveLength(1);
      expect(errors[0].content).toBe('Agent execution timed out after 300s');
    });

    it('should reject when an error event follows the result (e.g. non-zero exit after the answer)', async () => {
      const inner = createMockExecutor([
        makeEvent('result', 'partial answer'),
        makeEvent('error', 'Process exited with code 1'),
      ]);
      const proxy = new StreamingExecutorProxy(inner, channel);

      const consumer = (async () => {
        for await (const _event of channel) {
          /* drain */
        }
      })();

      await expect(proxy.execute('prompt')).rejects.toThrow('Process exited with code 1');
      channel.close();
      await consumer;
    });

    it('should resolve when a recoverable error event is followed by the result', async () => {
      // Codex reports a stream reconnect as an error event mid-turn, then
      // finishes the turn; the finished turn is the outcome.
      const inner = createMockExecutor([
        makeEvent('error', 'Reconnecting... 1/5'),
        makeEvent('result', 'Final answer'),
      ]);
      const proxy = new StreamingExecutorProxy(inner, channel);

      const consumer = (async () => {
        for await (const _event of channel) {
          /* drain */
        }
      })();

      await expect(proxy.execute('prompt')).resolves.toEqual({ result: 'Final answer' });
      channel.close();
      await consumer;
    });

    it('should reject when the stream ended without a result event', async () => {
      const inner = createMockExecutor([makeEvent('progress', 'partial text')]);
      const proxy = new StreamingExecutorProxy(inner, channel);

      const consumer = (async () => {
        for await (const _event of channel) {
          /* drain */
        }
      })();

      await expect(proxy.execute('prompt')).rejects.toThrow(/without a result/i);
      channel.close();
      await consumer;
    });

    it('should keep the shared channel open so a second execute() still delivers events', async () => {
      // One proxy + channel serves every node of a graph; closing it after the
      // first node silently dropped every later node's events.
      const inner = createMockExecutor([makeEvent('result', 'node output')]);
      const proxy = new StreamingExecutorProxy(inner, channel);

      const collected: AgentExecutionStreamEvent[] = [];
      const consumer = (async () => {
        for await (const event of channel) {
          collected.push(event);
        }
      })();

      await proxy.execute('first node');
      await proxy.execute('second node');
      channel.close();
      await consumer;

      expect(collected.filter((e) => e.type === 'result')).toHaveLength(2);
    });
  });

  describe('executeStream()', () => {
    it('should delegate directly to inner.executeStream()', async () => {
      const events = [makeEvent('result', 'streamed')];
      const inner = createMockExecutor(events);
      const proxy = new StreamingExecutorProxy(inner, channel);

      const collected: AgentExecutionStreamEvent[] = [];
      for await (const event of proxy.executeStream('prompt')) {
        collected.push(event);
      }

      expect(collected).toHaveLength(1);
      expect(collected[0].content).toBe('streamed');
    });
  });

  describe('supportsFeature()', () => {
    it('should delegate to inner.supportsFeature()', () => {
      const inner = createMockExecutor([]);
      const proxy = new StreamingExecutorProxy(inner, channel);

      proxy.supportsFeature(AgentFeature.streaming);

      expect(inner.supportsFeature).toHaveBeenCalledWith(AgentFeature.streaming);
    });
  });

  describe('agentType', () => {
    it('should return inner agentType', () => {
      const inner = createMockExecutor([]);
      const proxy = new StreamingExecutorProxy(inner, channel);

      expect(proxy.agentType).toBe(AgentType.ClaudeCode);
    });
  });
});
