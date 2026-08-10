import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmProxyExecutorService } from '@/infrastructure/services/agents/common/executors/llmproxy-executor.service.js';
import { AgentType } from '@/domain/generated/output.js';
import * as openaiCompatible from '@ai-sdk/openai-compatible';
import { AiSdkBaseExecutorService } from '@/infrastructure/services/agents/common/executors/ai-sdk-base-executor.service.js';

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn().mockReturnValue({
    chatModel: vi.fn().mockReturnValue({ provider: 'mock-model' }),
  }),
}));

describe('LlmProxyExecutorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should instantiate correctly and set agentType', () => {
    const service = new LlmProxyExecutorService();
    expect(service).toBeInstanceOf(LlmProxyExecutorService);
    expect(service).toBeInstanceOf(AiSdkBaseExecutorService);
    expect(service.agentType).toBe(AgentType.LlmProxy);
  });

  it('should use default localhost:4000/v1 when no baseUrl is provided', () => {
    new LlmProxyExecutorService();
    expect(openaiCompatible.createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'llmproxy',
        baseURL: 'http://localhost:4000/v1',
      })
    );
  });

  it('should use provided baseUrl when passed in', () => {
    new LlmProxyExecutorService('http://custom-proxy:5000/v1');
    expect(openaiCompatible.createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'llmproxy',
        baseURL: 'http://custom-proxy:5000/v1',
      })
    );
  });
});
