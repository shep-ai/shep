/**
 * AI SDK Base Executor Service
 *
 * Abstract base class implementing IAgentExecutor using the Vercel AI SDK.
 * Handles all AI SDK interaction: generateText, streamText, generateObject,
 * response mapping, streaming conversion, error handling, timeout management,
 * and token usage extraction.
 *
 * Concrete subclasses only need to implement createModel() and set agentType.
 * This keeps provider-specific logic minimal (just provider construction).
 *
 * Following Clean Architecture:
 * - This file lives in infrastructure layer
 * - AI SDK imports are confined to this file and its subclasses
 * - Application and domain layers have zero knowledge of the Vercel AI SDK
 */

import { generateText, streamText, generateObject, jsonSchema, APICallError } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { AgentType, AgentFeature } from '../../../../../domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
  AgentExecutionUsage,
} from '../../../../../application/ports/output/agents/agent-executor.interface.js';

/** Default timeout in milliseconds (5 minutes) */
const DEFAULT_TIMEOUT_MS = 300_000;

/** Features supported by all SDK-based executors */
const SDK_SUPPORTED_FEATURES = new Set<string>(['streaming', 'structured-output', 'system-prompt']);

/**
 * Abstract base class for AI SDK-based executor services.
 *
 * Implements the IAgentExecutor interface by delegating to the Vercel AI SDK's
 * generateText, streamText, and generateObject functions. Concrete subclasses
 * provide the provider-specific LanguageModel via createModel().
 */
export abstract class AiSdkBaseExecutorService implements IAgentExecutor {
  abstract readonly agentType: AgentType;

  constructor(
    private readonly apiKey: string,
    private readonly providerDisplayName: string
  ) {}

  /**
   * Create a LanguageModel instance for the given model ID.
   * Subclasses construct the provider-specific model here.
   */
  protected abstract createModel(modelId?: string): LanguageModelV3;

  supportsFeature(feature: AgentFeature): boolean {
    return SDK_SUPPORTED_FEATURES.has(feature as string);
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const model = this.createModel(options?.model);
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

    try {
      if (options?.outputSchema) {
        return await this.executeStructured(prompt, model, timeout, options);
      }

      const response = await generateText({
        model,
        prompt,
        system: options?.systemPrompt,
        timeout,
      });

      return {
        result: response.text,
        sessionId: undefined,
        usage: this.mapUsage(response.usage),
      };
    } catch (error) {
      throw this.enhanceError(error, timeout);
    }
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    const model = this.createModel(options?.model);
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

    let streamResult: ReturnType<typeof streamText>;
    try {
      streamResult = streamText({
        model,
        prompt,
        system: options?.systemPrompt,
        timeout,
      });
    } catch (error) {
      throw this.enhanceError(error, timeout);
    }

    let fullText = '';
    try {
      for await (const part of streamResult.fullStream) {
        if (part.type === 'text-delta') {
          fullText += part.text;
          yield {
            type: 'progress',
            content: part.text,
            timestamp: new Date(),
          };
        } else if (part.type === 'error') {
          throw part.error;
        }
      }

      yield {
        type: 'result',
        content: fullText,
        timestamp: new Date(),
      };
    } catch (error) {
      throw this.enhanceError(error, timeout);
    }
  }

  /**
   * Execute with structured output via generateObject.
   * Routes here when options.outputSchema is provided.
   */
  private async executeStructured(
    prompt: string,
    model: LanguageModelV3,
    timeout: number,
    options: AgentExecutionOptions
  ): Promise<AgentExecutionResult> {
    const response = await generateObject({
      model,
      prompt,
      system: options.systemPrompt,
      schema: jsonSchema(options.outputSchema!),
      timeout,
    });

    return {
      result: JSON.stringify(response.object),
      sessionId: undefined,
      usage: this.mapUsage(response.usage),
      metadata: {
        structured_output: response.object,
      },
    };
  }

  /**
   * Map AI SDK LanguageModelUsage to our AgentExecutionUsage.
   */
  private mapUsage(usage: {
    inputTokens?: number;
    outputTokens?: number;
    inputTokenDetails?: {
      cacheWriteTokens?: number;
      cacheReadTokens?: number;
    };
  }): AgentExecutionUsage {
    return {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cacheCreationInputTokens: usage.inputTokenDetails?.cacheWriteTokens,
      cacheReadInputTokens: usage.inputTokenDetails?.cacheReadTokens,
    };
  }

  /**
   * Enhance errors with provider context for better diagnostics.
   * Never includes the API key in error messages.
   */
  private enhanceError(error: unknown, timeout: number): Error {
    const provider = this.providerDisplayName;

    if (APICallError.isInstance(error)) {
      const { statusCode, responseHeaders } = error;

      if (statusCode === 401 || statusCode === 403) {
        return new Error(
          `${provider}: Authentication failed (HTTP ${statusCode}). Check your API key in settings.`
        );
      }

      if (statusCode === 429) {
        const retryAfter = responseHeaders?.['retry-after'];
        const retryMsg = retryAfter ? ` Retry after ${retryAfter}s.` : '';
        return new Error(`${provider}: Rate limit exceeded (HTTP 429).${retryMsg}`);
      }

      if (statusCode && statusCode >= 500) {
        return new Error(
          `${provider}: Server error (HTTP ${statusCode}). The provider may be experiencing issues.`
        );
      }

      return new Error(`${provider}: API error (HTTP ${statusCode}): ${error.message}`);
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timed out')) {
        return new Error(`${provider}: Request timed out after ${timeout}ms.`);
      }

      if (
        error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')
      ) {
        return new Error(`${provider}: Connection failed. Check your internet connection.`);
      }

      return new Error(`${provider}: ${error.message}`);
    }

    return new Error(`${provider}: An unexpected error occurred.`);
  }
}
