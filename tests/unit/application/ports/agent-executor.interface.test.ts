/**
 * Agent Executor Interface Type Contract Tests
 *
 * Validates that the IAgentExecutor and IAgentExecutorFactory interfaces
 * compile correctly and their type contracts are sound.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type {
  IAgentExecutor,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
  AgentExecutionOptions,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IAgentExecutorFactory } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import { AgentType, AgentFeature } from '@/domain/generated/output.js';

describe('IAgentExecutor type contracts', () => {
  it('should define execute method signature', () => {
    // Type-level test: verify the interface compiles
    const mockExecutor: IAgentExecutor = {
      agentType: AgentType.ClaudeCode,
      execute: async (_prompt: string, _options?: AgentExecutionOptions) => ({
        result: 'test',
      }),
      executeStream: async function* (_prompt: string, _options?: AgentExecutionOptions) {
        yield { type: 'result' as const, content: 'test', timestamp: new Date() };
      },
      supportsFeature: (_feature: AgentFeature) => true,
    };
    expect(mockExecutor.agentType).toBe(AgentType.ClaudeCode);
  });

  it('should define AgentExecutionResult type', () => {
    const result: AgentExecutionResult = {
      result: 'analysis complete',
      sessionId: 'session-123',
      usage: { inputTokens: 100, outputTokens: 200 },
      metadata: { key: 'value' },
    };
    expect(result.result).toBe('analysis complete');
    expect(result.sessionId).toBe('session-123');
    expect(result.usage?.inputTokens).toBe(100);
    expect(result.usage?.outputTokens).toBe(200);
  });

  it('should allow AgentExecutionResult with only required fields', () => {
    const result: AgentExecutionResult = {
      result: 'minimal result',
    };
    expect(result.result).toBe('minimal result');
    expect(result.sessionId).toBeUndefined();
    expect(result.usage).toBeUndefined();
    expect(result.metadata).toBeUndefined();
  });

  it('should define AgentExecutionStreamEvent type', () => {
    const event: AgentExecutionStreamEvent = {
      type: 'progress',
      content: 'processing...',
      timestamp: new Date(),
    };
    expect(event.type).toBe('progress');
    expect(event.content).toBe('processing...');
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it('should support all stream event types', () => {
    const progressEvent: AgentExecutionStreamEvent = {
      type: 'progress',
      content: 'working...',
      timestamp: new Date(),
    };
    const resultEvent: AgentExecutionStreamEvent = {
      type: 'result',
      content: 'done',
      timestamp: new Date(),
    };
    const errorEvent: AgentExecutionStreamEvent = {
      type: 'error',
      content: 'failed',
      timestamp: new Date(),
    };
    expect(progressEvent.type).toBe('progress');
    expect(resultEvent.type).toBe('result');
    expect(errorEvent.type).toBe('error');
  });

  it('should define AgentExecutionOptions type with all optional fields', () => {
    const options: AgentExecutionOptions = {
      cwd: '/project',
      allowedTools: ['read', 'write'],
      resumeSession: 'session-456',
      maxTurns: 10,
      model: 'claude-sonnet-4-5',
      systemPrompt: 'You are a helpful assistant',
      outputSchema: { type: 'object' },
      timeout: 30000,
    };
    expect(options.cwd).toBe('/project');
    expect(options.allowedTools).toEqual(['read', 'write']);
    expect(options.maxTurns).toBe(10);
  });

  it('should allow empty AgentExecutionOptions', () => {
    const options: AgentExecutionOptions = {};
    expect(options.cwd).toBeUndefined();
  });

  it('should support supportsFeature with AgentFeature enum', () => {
    const mockExecutor: IAgentExecutor = {
      agentType: AgentType.ClaudeCode,
      execute: async () => ({ result: '' }),
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      executeStream: async function* () {},
      supportsFeature: (_feature: AgentFeature) => _feature === AgentFeature.streaming,
    };
    expect(mockExecutor.supportsFeature(AgentFeature.streaming)).toBe(true);
  });
});

describe('IAgentExecutorFactory type contracts', () => {
  it('should define createExecutor method signature', () => {
    const mockFactory: IAgentExecutorFactory = {
      createExecutor: (agentType, _authConfig) => ({
        agentType,
        execute: async () => ({ result: '' }),
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        executeStream: async function* () {},
        supportsFeature: () => false,
      }),
      getSupportedAgents: () => [AgentType.ClaudeCode],
      getCliInfo: () => [],
      getSupportedModels: () => [],
      listAvailableModels: async () => [],
      createInteractiveExecutor: () => {
        throw new Error('not implemented');
      },
      supportsInteractive: () => false,
    };
    expect(mockFactory.getSupportedAgents()).toContain(AgentType.ClaudeCode);
  });

  it('should return an IAgentExecutor from createExecutor', () => {
    const mockFactory: IAgentExecutorFactory = {
      createExecutor: (agentType, _authConfig) => ({
        agentType,
        execute: async () => ({ result: 'created' }),
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        executeStream: async function* () {},
        supportsFeature: () => false,
      }),
      getSupportedAgents: () => [AgentType.ClaudeCode, AgentType.GeminiCli],
      getCliInfo: () => [],
      getSupportedModels: () => [],
      listAvailableModels: async () => [],
      createInteractiveExecutor: () => {
        throw new Error('not implemented');
      },
      supportsInteractive: () => false,
    };
    const executor = mockFactory.createExecutor(AgentType.ClaudeCode, {
      type: AgentType.ClaudeCode,
      authMethod: 'api-key',
    } as any);
    expect(executor.agentType).toBe(AgentType.ClaudeCode);
  });

  it('should report supported agent types', () => {
    const mockFactory: IAgentExecutorFactory = {
      createExecutor: (agentType) => ({
        agentType,
        execute: async () => ({ result: '' }),
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        executeStream: async function* () {},
        supportsFeature: () => false,
      }),
      getSupportedAgents: () => [AgentType.ClaudeCode, AgentType.GeminiCli],
      getCliInfo: () => [],
      getSupportedModels: () => [],
      listAvailableModels: async () => [],
      createInteractiveExecutor: () => {
        throw new Error('not implemented');
      },
      supportsInteractive: () => false,
    };
    const supported = mockFactory.getSupportedAgents();
    expect(supported).toHaveLength(2);
    expect(supported).toContain(AgentType.ClaudeCode);
    expect(supported).toContain(AgentType.GeminiCli);
  });
});
