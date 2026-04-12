import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn().mockReturnValue({ agent: { type: 'claude-code' } }),
}));

import { StructuredAgentCallerService } from '@/infrastructure/services/agents/common/structured-agent-caller.service.js';
import { StructuredCallError } from '@/application/ports/output/agents/structured-call-error.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentExecutorFactory } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import { AgentFeature } from '@/domain/generated/output.js';

describe('StructuredAgentCallerService', () => {
  let service: StructuredAgentCallerService;
  let mockExecutor: IAgentExecutor;
  let mockProvider: IAgentExecutorProvider;
  let mockFactory: IAgentExecutorFactory;

  const testSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      count: { type: 'number' },
    },
    required: ['name', 'count'],
    additionalProperties: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecutor = {
      agentType: 'claude-code' as any,
      execute: vi.fn(),
      executeStream: vi.fn(),
      supportsFeature: vi.fn(),
    };
    mockProvider = {
      getExecutor: vi.fn().mockReturnValue(mockExecutor),
    };
    mockFactory = {
      createExecutor: vi.fn().mockReturnValue(mockExecutor),
      getSupportedModels: vi.fn().mockReturnValue([]),
      listAvailableModels: vi.fn().mockResolvedValue([]),
      getSupportedAgents: vi.fn().mockReturnValue([]),
      getCliInfo: vi.fn().mockReturnValue(undefined),
      createInteractiveExecutor: vi.fn(),
      supportsInteractive: vi.fn().mockReturnValue(false),
    };
    service = new StructuredAgentCallerService(mockProvider, mockFactory);
  });

  describe('native path (agent supports structured-output)', () => {
    beforeEach(() => {
      vi.mocked(mockExecutor.supportsFeature).mockReturnValue(true);
    });

    it('returns metadata.structured_output when available', async () => {
      const expected = { name: 'test', count: 42 };
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: '',
        metadata: { structured_output: expected },
      });

      const result = await service.call<{ name: string; count: number }>(
        'extract data',
        testSchema
      );

      expect(result).toEqual(expected);
    });

    it('passes outputSchema in execute options', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: '{"name":"test","count":1}',
        metadata: { structured_output: { name: 'test', count: 1 } },
      });

      await service.call('extract data', testSchema);

      expect(mockExecutor.execute).toHaveBeenCalledWith(
        'extract data',
        expect.objectContaining({ outputSchema: testSchema })
      );
    });

    it('falls back to parsing result text when structured_output missing in metadata', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: '{"name":"fallback","count":7}',
        metadata: {},
      });

      const result = await service.call<{ name: string; count: number }>(
        'extract data',
        testSchema
      );

      expect(result).toEqual({ name: 'fallback', count: 7 });
    });

    it('forwards options (maxTurns, silent, etc.) to executor', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: '',
        metadata: { structured_output: { name: 'x', count: 0 } },
      });

      await service.call('extract data', testSchema, {
        maxTurns: 5,
        silent: true,
        cwd: '/tmp',
      });

      expect(mockExecutor.execute).toHaveBeenCalledWith(
        'extract data',
        expect.objectContaining({
          maxTurns: 5,
          silent: true,
          cwd: '/tmp',
          outputSchema: testSchema,
        })
      );
    });
  });

  describe('prompt fallback path (agent does NOT support structured-output)', () => {
    beforeEach(() => {
      vi.mocked(mockExecutor.supportsFeature).mockReturnValue(false);
    });

    it('wraps prompt with JSON instructions when no native support', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: '{"name":"wrapped","count":3}',
      });

      await service.call('extract data', testSchema);

      const calledPrompt = vi.mocked(mockExecutor.execute).mock.calls[0][0];
      expect(calledPrompt).toContain('extract data');
      expect(calledPrompt).toContain('JSON');
    });

    it('does NOT pass outputSchema to executor', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: '{"name":"test","count":1}',
      });

      await service.call('extract data', testSchema);

      const calledOptions = vi.mocked(mockExecutor.execute).mock.calls[0][1];
      expect(calledOptions?.outputSchema).toBeUndefined();
    });

    it('parses JSON from text result', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: '{"name":"parsed","count":99}',
      });

      const result = await service.call<{ name: string; count: number }>(
        'extract data',
        testSchema
      );

      expect(result).toEqual({ name: 'parsed', count: 99 });
    });

    it('handles JSON wrapped in code fences', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: 'Here is the result:\n```json\n{"name":"fenced","count":5}\n```',
      });

      const result = await service.call<{ name: string; count: number }>(
        'extract data',
        testSchema
      );

      expect(result).toEqual({ name: 'fenced', count: 5 });
    });

    it('handles JSON with surrounding prose text', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result:
          'I analyzed the request and here is the output: {"name":"prose","count":12} Hope that helps!',
      });

      const result = await service.call<{ name: string; count: number }>(
        'extract data',
        testSchema
      );

      expect(result).toEqual({ name: 'prose', count: 12 });
    });
  });

  describe('error cases', () => {
    beforeEach(() => {
      vi.mocked(mockExecutor.supportsFeature).mockReturnValue(false);
    });

    it('throws StructuredCallError with parse_failed when no JSON in response', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: 'This response contains no JSON at all.',
      });

      await expect(service.call('extract data', testSchema)).rejects.toThrow(StructuredCallError);
      await expect(service.call('extract data', testSchema)).rejects.toMatchObject({
        code: 'parse_failed',
      });
    });

    it('throws StructuredCallError with parse_failed on incomplete JSON', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: '{"name":"incomplete","count":',
      });

      await expect(service.call('extract data', testSchema)).rejects.toThrow(StructuredCallError);
      await expect(service.call('extract data', testSchema)).rejects.toMatchObject({
        code: 'parse_failed',
      });
    });

    it('propagates executor errors directly (not wrapped in StructuredCallError)', async () => {
      const executorError = new Error('Agent connection failed');
      vi.mocked(mockExecutor.execute).mockRejectedValue(executorError);

      await expect(service.call('extract data', testSchema)).rejects.toThrow(executorError);
      await expect(service.call('extract data', testSchema)).rejects.not.toBeInstanceOf(
        StructuredCallError
      );
    });
  });

  describe('agent type override', () => {
    it('uses factory when agentType option is provided', async () => {
      const cursorExecutor: IAgentExecutor = {
        agentType: 'cursor' as any,
        execute: vi.fn().mockResolvedValue({
          result: '{"name":"cursor","count":1}',
        }),
        executeStream: vi.fn(),
        supportsFeature: vi.fn().mockReturnValue(false),
      };
      vi.mocked(mockFactory.createExecutor).mockReturnValue(cursorExecutor);

      await service.call('test', testSchema, { agentType: 'cursor' as any });

      expect(mockFactory.createExecutor).toHaveBeenCalledWith('cursor', expect.any(Object));
      expect(mockProvider.getExecutor).not.toHaveBeenCalled();
    });

    it('uses provider when agentType is not provided', async () => {
      vi.mocked(mockExecutor.supportsFeature).mockReturnValue(false);
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: '{"name":"default","count":1}',
      });

      await service.call('test', testSchema);

      expect(mockProvider.getExecutor).toHaveBeenCalled();
      expect(mockFactory.createExecutor).not.toHaveBeenCalled();
    });
  });

  describe('feature detection', () => {
    it('checks for AgentFeature.structuredOutput on the executor', async () => {
      vi.mocked(mockExecutor.supportsFeature).mockReturnValue(true);
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        result: '',
        metadata: { structured_output: { name: 'x', count: 0 } },
      });

      await service.call('test', testSchema);

      expect(mockExecutor.supportsFeature).toHaveBeenCalledWith(AgentFeature.structuredOutput);
    });
  });
});
