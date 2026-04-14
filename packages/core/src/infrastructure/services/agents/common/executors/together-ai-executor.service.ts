/**
 * Together AI Executor Service
 *
 * Concrete executor for the Together AI provider, extending AiSdkBaseExecutorService.
 * Uses @ai-sdk/openai-compatible as a workaround until @ai-sdk/togetherai supports
 * AI SDK v6. Migration to the dedicated package is a one-line swap:
 *   import { createTogetherAI } from '@ai-sdk/togetherai';
 *   this.provider = createTogetherAI({ apiKey });
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { AgentType } from '../../../../../domain/generated/output.js';
import { AiSdkBaseExecutorService } from './ai-sdk-base-executor.service.js';

const TOGETHER_AI_BASE_URL = 'https://api.together.xyz/v1';
const DEFAULT_MODEL = 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8';

export class TogetherAiExecutorService extends AiSdkBaseExecutorService {
  readonly agentType = AgentType.TogetherAi;
  private readonly provider: ReturnType<typeof createOpenAICompatible>;

  constructor(apiKey: string) {
    super(apiKey, 'Together AI');
    this.provider = createOpenAICompatible({
      name: 'together-ai',
      baseURL: TOGETHER_AI_BASE_URL,
      apiKey,
    });
  }

  protected createModel(modelId?: string): LanguageModelV3 {
    return this.provider.chatModel(modelId ?? DEFAULT_MODEL);
  }
}
