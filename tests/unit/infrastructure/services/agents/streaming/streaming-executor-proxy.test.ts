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

      await consumer;

      expect(result.result).toBe('The final result text');
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

      await consumer;

      expect(collected.some((e) => e.type === 'error')).toBe(true);
      const errorEvent = collected.find((e) => e.type === 'error');
      expect(errorEvent!.content).toBe('Stream exploded');
    });

    it('should close channel after execute() completes', async () => {
      const events = [makeEvent('result', 'done')];
      const inner = createMockExecutor(events);
      const proxy = new StreamingExecutorProxy(inner, channel);

      let iterationEnded = false;
      const consumer = (async () => {
        for await (const _event of channel) {
          /* drain */
        }
        iterationEnded = true;
      })();

      await proxy.execute('prompt');
      await consumer;

      expect(iterationEnded).toBe(true);
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
