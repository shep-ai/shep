/**
 * Ollama Executor Service
 *
 * Concrete executor for the Ollama local LLM runtime, extending AiSdkBaseExecutorService.
 * Uses @ai-sdk/openai-compatible since Ollama exposes an OpenAI-compatible API at
 * http://localhost:11434/v1. No API key required — Ollama runs locally.
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import { AgentType } from '../../../../../domain/generated/output.js';
import { AiSdkBaseExecutorService } from './ai-sdk-base-executor.service.js';
import { createLanguageModelSource, type LanguageModelSource } from '../language-model-factory.js';

export class OllamaExecutorService extends AiSdkBaseExecutorService {
  readonly agentType = AgentType.Ollama;
  private readonly source: LanguageModelSource;

  constructor(baseUrl?: string) {
    super('', 'Ollama');
    this.source = createLanguageModelSource(AgentType.Ollama, baseUrl);
  }

  protected createModel(modelId?: string): LanguageModelV3 {
    return this.source.model(modelId);
  }
}
