/**
 * LlmProxy Executor Service
 *
 * Concrete executor for the LLMProxy local proxy, extending AiSdkBaseExecutorService.
 * Uses @ai-sdk/openai-compatible since LLMProxy exposes an OpenAI-compatible API at
 * http://localhost:4000/v1 by default. No real API key required for local network.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { AgentType } from '../../../../../domain/generated/output.js';
import { AiSdkBaseExecutorService } from './ai-sdk-base-executor.service.js';

const LLMPROXY_DEFAULT_BASE_URL = 'http://localhost:4000/v1';
const DEFAULT_MODEL = 'gpt-4o'; // Assuming a typical default or whatever the user maps in their proxy

export class LlmProxyExecutorService extends AiSdkBaseExecutorService {
  readonly agentType = AgentType.LlmProxy;
  private readonly provider: ReturnType<typeof createOpenAICompatible>;

  constructor(baseUrl?: string) {
    super('', 'LlmProxy'); // LlmProxy typically doesn't need an API key for local access, but AiSdkBaseExecutorService requires one in signature
    this.provider = createOpenAICompatible({
      name: 'llmproxy',
      baseURL: baseUrl ?? LLMPROXY_DEFAULT_BASE_URL,
      apiKey: 'llmproxy', // dummy key for local proxy
    });
  }

  protected createModel(modelId?: string): LanguageModelV3 {
    return this.provider.chatModel(modelId ?? DEFAULT_MODEL);
  }
}
