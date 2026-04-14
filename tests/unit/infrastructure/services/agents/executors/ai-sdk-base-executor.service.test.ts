/**
 * AiSdkBaseExecutorService Unit Tests
 *
 * Tests for the abstract AI SDK base executor service.
 * Uses MockLanguageModelV3 from ai/test with real AI SDK functions.
 * No module mocking needed — the mock model controls all responses.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { AgentFeature } from '@/domain/generated/output.js';
import type { AgentExecutionStreamEvent } from '@/application/ports/output/agents/agent-executor.interface.js';
import { AiSdkBaseExecutorService } from '@/infrastructure/services/agents/common/executors/ai-sdk-base-executor.service.js';

/**
 * Concrete test subclass of the abstract AiSdkBaseExecutorService.
 * Returns a configurable MockLanguageModelV3 instance.
 */
class TestSdkExecutor extends AiSdkBaseExecutorService {
  readonly agentType = 'openrouter' as any;
  mockModel: MockLanguageModelV3;

  constructor(apiKey: string, model: MockLanguageModelV3) {
    super(apiKey, 'TestProvider');
    this.mockModel = model;
  }

  protected createModel(_modelId?: string): LanguageModelV3 {
    return this.mockModel;
  }
}

/** Helper to build a mock V3 generate result with text content */
function makeGenerateResult(
  text: string,
  usage?: {
    inputTotal?: number;
    outputTotal?: number;
    cacheRead?: number;
    cacheWrite?: number;
  }
) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
      inputTokens: {
        total: usage?.inputTotal ?? 100,
        noCache: undefined,
        cacheRead: usage?.cacheRead ?? undefined,
        cacheWrite: usage?.cacheWrite ?? undefined,
      },
      outputTokens: {
        total: usage?.outputTotal ?? 50,
        text: undefined,
        reasoning: undefined,
      },
    },
    request: { body: {} },
    warnings: [],
  };
}

/** Helper to build a mock V3 stream result for streaming tests */
function makeStreamResult(
  chunks: string[],
  usage?: {
    inputTotal?: number;
    outputTotal?: number;
    cacheRead?: number;
    cacheWrite?: number;
  }
) {
  const textId = 'text-0';
  return {
    stream: convertArrayToReadableStream([
      { type: 'stream-start' as const, warnings: [] },
      { type: 'text-start' as const, id: textId },
      ...chunks.map((text) => ({
        type: 'text-delta' as const,
        id: textId,
        delta: text,
      })),
      { type: 'text-end' as const, id: textId },
      {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: undefined },
        usage: {
          inputTokens: {
            total: usage?.inputTotal ?? 100,
            noCache: undefined,
            cacheRead: usage?.cacheRead ?? undefined,
            cacheWrite: usage?.cacheWrite ?? undefined,
          },
          outputTokens: {
            total: usage?.outputTotal ?? 50,
            text: undefined,
            reasoning: undefined,
          },
        },
        providerMetadata: undefined,
      },
    ]),
    request: { body: {} },
  };
}

describe('AiSdkBaseExecutorService', () => {
  // ──────────────────────────────────────────────────────────────
  // Task 4: execute() with generateText
  // ──────────────────────────────────────────────────────────────

  describe('execute() — generateText', () => {
    it('calls generateText with prompt and returns result text', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: makeGenerateResult('Hello from the model'),
      });
      const executor = new TestSdkExecutor('test-key', model);

      const result = await executor.execute('Say hello');

      expect(result.result).toBe('Hello from the model');
      expect(model.doGenerateCalls).toHaveLength(1);
    });

    it('maps AI SDK usage to AgentExecutionUsage', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: makeGenerateResult('Response', {
          inputTotal: 200,
          outputTotal: 100,
          cacheWrite: 50,
          cacheRead: 30,
        }),
      });
      const executor = new TestSdkExecutor('test-key', model);

      const result = await executor.execute('Test prompt');

      expect(result.usage).toMatchObject({
        inputTokens: 200,
        outputTokens: 100,
        cacheCreationInputTokens: 50,
        cacheReadInputTokens: 30,
      });
    });

    it('passes system prompt from options.systemPrompt', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: makeGenerateResult('Response'),
      });
      const executor = new TestSdkExecutor('test-key', model);

      await executor.execute('User message', {
        systemPrompt: 'You are a helpful assistant',
      });

      const callOptions = model.doGenerateCalls[0];
      const systemMsg = callOptions.prompt.find((m: any) => m.role === 'system');
      expect(systemMsg).toBeDefined();
      expect((systemMsg as any).content).toBe('You are a helpful assistant');
    });

    it('executes without timeout option (uses default)', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: makeGenerateResult('Response'),
      });
      const executor = new TestSdkExecutor('test-key', model);

      const result = await executor.execute('Test prompt');
      expect(result.result).toBe('Response');
    });

    it('passes model option to createModel', async () => {
      let capturedModelId: string | undefined;
      class ModelCapturingExecutor extends AiSdkBaseExecutorService {
        readonly agentType = 'openrouter' as any;
        private mockModel: MockLanguageModelV3;

        constructor(model: MockLanguageModelV3) {
          super('key', 'Test');
          this.mockModel = model;
        }

        protected createModel(modelId?: string): LanguageModelV3 {
          capturedModelId = modelId;
          return this.mockModel;
        }
      }

      const model = new MockLanguageModelV3({
        doGenerate: makeGenerateResult('Ok'),
      });
      const executor = new ModelCapturingExecutor(model);

      await executor.execute('Test', { model: 'custom-model' });

      expect(capturedModelId).toBe('custom-model');
    });

    it('sets sessionId to undefined', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: makeGenerateResult('Response'),
      });
      const executor = new TestSdkExecutor('test-key', model);

      const result = await executor.execute('Test');

      expect(result.sessionId).toBeUndefined();
    });

    it('handles undefined cache token details gracefully', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: makeGenerateResult('Response', {
          inputTotal: 50,
          outputTotal: 25,
        }),
      });
      const executor = new TestSdkExecutor('test-key', model);

      const result = await executor.execute('Test');

      expect(result.usage?.inputTokens).toBe(50);
      expect(result.usage?.outputTokens).toBe(25);
      expect(result.usage?.cacheCreationInputTokens).toBeUndefined();
      expect(result.usage?.cacheReadInputTokens).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Task 5: executeStream() with streamText
  // ──────────────────────────────────────────────────────────────

  describe('executeStream() — streamText', () => {
    it('yields progress events for each text chunk', async () => {
      const model = new MockLanguageModelV3({
        doStream: makeStreamResult(['Hello', ' world', '!']),
      });
      const executor = new TestSdkExecutor('test-key', model);

      const events: AgentExecutionStreamEvent[] = [];
      for await (const event of executor.executeStream('Say hello')) {
        events.push(event);
      }

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents).toHaveLength(3);
      expect(progressEvents[0].content).toBe('Hello');
      expect(progressEvents[1].content).toBe(' world');
      expect(progressEvents[2].content).toBe('!');
    });

    it('yields a final result event with full text', async () => {
      const model = new MockLanguageModelV3({
        doStream: makeStreamResult(['Hello', ' world']),
      });
      const executor = new TestSdkExecutor('test-key', model);

      const events: AgentExecutionStreamEvent[] = [];
      for await (const event of executor.executeStream('Test')) {
        events.push(event);
      }

      const resultEvent = events.find((e) => e.type === 'result');
      expect(resultEvent).toBeDefined();
      expect(resultEvent!.content).toBe('Hello world');
    });

    it('passes system prompt to streamText', async () => {
      const model = new MockLanguageModelV3({
        doStream: makeStreamResult(['Response']),
      });
      const executor = new TestSdkExecutor('test-key', model);

      const events: AgentExecutionStreamEvent[] = [];
      for await (const event of executor.executeStream('Test', {
        systemPrompt: 'Be helpful',
      })) {
        events.push(event);
      }

      const callOptions = model.doStreamCalls[0];
      const systemMsg = callOptions.prompt.find((m: any) => m.role === 'system');
      expect(systemMsg).toBeDefined();
      expect((systemMsg as any).content).toBe('Be helpful');
    });

    it('includes timestamps on all events', async () => {
      const model = new MockLanguageModelV3({
        doStream: makeStreamResult(['chunk']),
      });
      const executor = new TestSdkExecutor('test-key', model);

      const events: AgentExecutionStreamEvent[] = [];
      for await (const event of executor.executeStream('Test')) {
        events.push(event);
      }

      for (const event of events) {
        expect(event.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Task 6: structured output with generateObject
  // ──────────────────────────────────────────────────────────────

  describe('execute() — structured output via generateObject', () => {
    it('returns structured object when outputSchema is provided', async () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        additionalProperties: false,
      };
      const model = new MockLanguageModelV3({
        doGenerate: makeGenerateResult('{"name":"Alice"}', { inputTotal: 50, outputTotal: 20 }),
      });
      const executor = new TestSdkExecutor('test-key', model);

      const result = await executor.execute('Extract name', {
        outputSchema: schema,
      });

      expect(result.metadata?.structured_output).toEqual({ name: 'Alice' });
      expect(result.result).toBe(JSON.stringify({ name: 'Alice' }));
    });

    it('maps usage from structured output response', async () => {
      const schema = {
        type: 'object',
        properties: { x: { type: 'number' } },
        required: ['x'],
        additionalProperties: false,
      };
      const model = new MockLanguageModelV3({
        doGenerate: makeGenerateResult('{"x":42}', { inputTotal: 300, outputTotal: 150 }),
      });
      const executor = new TestSdkExecutor('test-key', model);

      const result = await executor.execute('Structured', {
        outputSchema: schema,
      });

      expect(result.usage?.inputTokens).toBe(300);
      expect(result.usage?.outputTokens).toBe(150);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Task 7: error handling
  // ──────────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('401 error includes provider name and API key check guidance', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: async () => {
          const { APICallError } = await import('ai');
          throw new APICallError({
            message: 'Unauthorized',
            url: 'https://api.test.com/v1/chat',
            requestBodyValues: {},
            statusCode: 401,
            isRetryable: false,
          });
        },
      });
      const executor = new TestSdkExecutor('test-key', model);

      await expect(executor.execute('Test')).rejects.toThrow(
        /TestProvider.*Authentication failed.*API key/i
      );
    });

    it('403 error includes provider name and API key check guidance', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: async () => {
          const { APICallError } = await import('ai');
          throw new APICallError({
            message: 'Forbidden',
            url: 'https://api.test.com/v1/chat',
            requestBodyValues: {},
            statusCode: 403,
            isRetryable: false,
          });
        },
      });
      const executor = new TestSdkExecutor('test-key', model);

      await expect(executor.execute('Test')).rejects.toThrow(
        /TestProvider.*Authentication failed.*API key/i
      );
    });

    it('429 error includes rate limit info', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: async () => {
          const { APICallError } = await import('ai');
          throw new APICallError({
            message: 'Too Many Requests',
            url: 'https://api.test.com/v1/chat',
            requestBodyValues: {},
            statusCode: 429,
            responseHeaders: { 'retry-after': '30' },
            isRetryable: false,
          });
        },
      });
      const executor = new TestSdkExecutor('test-key', model);

      await expect(executor.execute('Test')).rejects.toThrow(/rate limit/i);
    });

    it('5xx error includes server error message', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: async () => {
          const { APICallError } = await import('ai');
          throw new APICallError({
            message: 'Internal Server Error',
            url: 'https://api.test.com/v1/chat',
            requestBodyValues: {},
            statusCode: 500,
            isRetryable: false,
          });
        },
      });
      const executor = new TestSdkExecutor('test-key', model);

      await expect(executor.execute('Test')).rejects.toThrow(/server error/i);
    });

    it('network error includes connection failure message', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: async () => {
          const err = new Error('fetch failed');
          err.cause = new Error('ECONNREFUSED');
          throw err;
        },
      });
      const executor = new TestSdkExecutor('test-key', model);

      await expect(executor.execute('Test')).rejects.toThrow(/TestProvider.*Connection failed/i);
    });

    it('error messages never contain the API key', async () => {
      const model = new MockLanguageModelV3({
        doGenerate: async () => {
          const { APICallError } = await import('ai');
          throw new APICallError({
            message: 'Invalid API key: sk-test-secret-key-123',
            url: 'https://api.test.com/v1/chat',
            requestBodyValues: {},
            statusCode: 401,
            isRetryable: false,
          });
        },
      });
      const executor = new TestSdkExecutor('sk-test-secret-key-123', model);

      try {
        await executor.execute('Test');
      } catch (error: any) {
        expect(error.message).not.toContain('sk-test-secret-key-123');
      }
    });

    it('error handling works for executeStream too', async () => {
      const model = new MockLanguageModelV3({
        doStream: async () => {
          const { APICallError } = await import('ai');
          throw new APICallError({
            message: 'Unauthorized',
            url: 'https://api.test.com/v1/chat',
            requestBodyValues: {},
            statusCode: 401,
            isRetryable: false,
          });
        },
      });
      const executor = new TestSdkExecutor('test-key', model);

      try {
        for await (const _event of executor.executeStream('Test')) {
          // consume stream
        }
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('TestProvider');
        expect(error.message).toMatch(/Authentication failed/i);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────
  // supportsFeature
  // ──────────────────────────────────────────────────────────────

  describe('supportsFeature', () => {
    let executor: TestSdkExecutor;

    beforeEach(() => {
      const model = new MockLanguageModelV3({
        doGenerate: makeGenerateResult(''),
      });
      executor = new TestSdkExecutor('test-key', model);
    });

    it('returns true for streaming', () => {
      expect(executor.supportsFeature(AgentFeature.streaming)).toBe(true);
    });

    it('returns true for structured-output', () => {
      expect(executor.supportsFeature(AgentFeature.structuredOutput)).toBe(true);
    });

    it('returns true for system-prompt', () => {
      expect(executor.supportsFeature(AgentFeature.systemPrompt)).toBe(true);
    });

    it('returns false for session-resume', () => {
      expect(executor.supportsFeature(AgentFeature.sessionResume)).toBe(false);
    });

    it('returns false for tool-scoping', () => {
      expect(executor.supportsFeature(AgentFeature.toolScoping)).toBe(false);
    });

    it('returns false for session-listing', () => {
      expect(executor.supportsFeature(AgentFeature.sessionListing)).toBe(false);
    });
  });
});
