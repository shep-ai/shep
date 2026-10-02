/**
 * Together AI Executor Service
 *
 * Concrete executor for the Together AI provider, extending AiSdkBaseExecutorService.
 * Uses @ai-sdk/openai-compatible as a workaround until @ai-sdk/togetherai supports
 * AI SDK v6. Migration to the dedicated package is a one-line swap:
 *   import { createTogetherAI } from '@ai-sdk/togetherai';
 *   this.provider = createTogetherAI({ apiKey });
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import { AgentType } from '../../../../../domain/generated/output.js';
import { AiSdkBaseExecutorService } from './ai-sdk-base-executor.service.js';
import { createLanguageModelSource, type LanguageModelSource } from '../language-model-factory.js';

export class TogetherAiExecutorService extends AiSdkBaseExecutorService {
  readonly agentType = AgentType.TogetherAi;
  private readonly source: LanguageModelSource;

  constructor(apiKey: string) {
    super(apiKey, 'Together AI');
    this.source = createLanguageModelSource(AgentType.TogetherAi, apiKey);
  }

  protected createModel(modelId?: string): LanguageModelV3 {
    return this.source.model(modelId);
  }
}
