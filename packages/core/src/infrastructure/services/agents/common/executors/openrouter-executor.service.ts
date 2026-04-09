/**
 * OpenRouter Executor Service
 *
 * Concrete executor for the OpenRouter provider, extending AiSdkBaseExecutorService.
 * Creates models via @openrouter/ai-sdk-provider.
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { AgentType } from '../../../../../domain/generated/output.js';
import { AiSdkBaseExecutorService } from './ai-sdk-base-executor.service.js';

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5';

export class OpenRouterExecutorService extends AiSdkBaseExecutorService {
  readonly agentType = AgentType.OpenRouter;
  private readonly provider: ReturnType<typeof createOpenRouter>;

  constructor(apiKey: string) {
    super(apiKey, 'OpenRouter');
    this.provider = createOpenRouter({ apiKey });
  }

  protected createModel(modelId?: string): LanguageModelV3 {
    return this.provider.chat(modelId ?? DEFAULT_MODEL);
  }
}
