/**
 * Ollama Executor Service
 *
 * Concrete executor for the Ollama local LLM runtime, extending AiSdkBaseExecutorService.
 * Uses @ai-sdk/openai-compatible since Ollama exposes an OpenAI-compatible API at
 * http://localhost:11434/v1. No API key required — Ollama runs locally.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { AgentType } from '../../../../../domain/generated/output.js';
import { AiSdkBaseExecutorService } from './ai-sdk-base-executor.service.js';

const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434/v1';
const DEFAULT_MODEL = 'llama3.2';

export class OllamaExecutorService extends AiSdkBaseExecutorService {
  readonly agentType = AgentType.Ollama;
  private readonly provider: ReturnType<typeof createOpenAICompatible>;

  constructor(baseUrl?: string) {
    super('', 'Ollama');
    this.provider = createOpenAICompatible({
      name: 'ollama',
      baseURL: baseUrl ?? OLLAMA_DEFAULT_BASE_URL,
      apiKey: 'ollama',
    });
  }

  protected createModel(modelId?: string): LanguageModelV3 {
    return this.provider.chatModel(modelId ?? DEFAULT_MODEL);
  }
}
