/**
 * OpenRouter Executor Service
 *
 * Concrete executor for the OpenRouter provider, extending AiSdkBaseExecutorService.
 * Creates models via @openrouter/ai-sdk-provider.
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import { AgentType } from '../../../../../domain/generated/output.js';
import { AiSdkBaseExecutorService } from './ai-sdk-base-executor.service.js';
import { createLanguageModelSource, type LanguageModelSource } from '../language-model-factory.js';

export class OpenRouterExecutorService extends AiSdkBaseExecutorService {
  readonly agentType = AgentType.OpenRouter;
  private readonly source: LanguageModelSource;

  constructor(apiKey: string) {
    super(apiKey, 'OpenRouter');
    this.source = createLanguageModelSource(AgentType.OpenRouter, apiKey);
  }

  protected createModel(modelId?: string): LanguageModelV3 {
    return this.source.model(modelId);
  }
}
