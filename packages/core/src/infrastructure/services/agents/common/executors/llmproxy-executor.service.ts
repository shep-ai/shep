/**
 * LlmProxy Executor Service
 *
 * Concrete executor for the LLMProxy local proxy, extending AiSdkBaseExecutorService.
 * Uses @ai-sdk/openai-compatible since LLMProxy exposes an OpenAI-compatible API at
 * http://localhost:4000/v1 by default. No real API key required for local network.
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import { AgentType } from '../../../../../domain/generated/output.js';
import { AiSdkBaseExecutorService } from './ai-sdk-base-executor.service.js';
import { createLanguageModelSource, type LanguageModelSource } from '../language-model-factory.js';

export class LlmProxyExecutorService extends AiSdkBaseExecutorService {
  readonly agentType = AgentType.LlmProxy;
  private readonly source: LanguageModelSource;

  constructor(baseUrl?: string) {
    super('', 'LlmProxy'); // LlmProxy typically doesn't need an API key for local access, but AiSdkBaseExecutorService requires one in signature
    this.source = createLanguageModelSource(AgentType.LlmProxy, baseUrl);
  }

  protected createModel(modelId?: string): LanguageModelV3 {
    return this.source.model(modelId);
  }
}
