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

import {
  generateText,
  streamText,
  generateObject,
  jsonSchema,
  APICallError,
  type FinishReason,
} from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { AgentType, AgentFeature } from '../../../../../domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
  AgentExecutionUsage,
} from '../../../../../application/ports/output/agents/agent-executor.interface.js';
import { AGENT_ABORTED_MESSAGE, agentTimeoutMessage } from './process-stream.js';

/** Default timeout in milliseconds (5 minutes) */
const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Finish reasons that mean the model did NOT finish its answer.
 *
 * - `length`: it ran out of output tokens mid-answer.
 * - `content-filter`: the provider cut the response off.
 * - `error`: the provider reported a failure while generating.
 *
 * The text that comes back is a fragment, not an answer. Returning it as a
 * normal result lets a truncated run be read downstream as a completed one.
 */
const INCOMPLETE_FINISH_REASONS: ReadonlySet<FinishReason> = new Set<FinishReason>([
  'length',
  'content-filter',
  'error',
]);

/** Error names that mean the request's time budget ran out. */
const TIMEOUT_ERROR_NAMES: ReadonlySet<string> = new Set([
  // Our own `timeout` aborts the request through an AbortController…
  'AbortError',
  // …and AbortSignal.timeout() rejects with a DOMException of this name,
  // whose message ("The operation was aborted due to timeout") says neither.
  'TimeoutError',
]);

/** Message fragment older SDK paths use for a request timeout. */
const TIMED_OUT_TEXT = 'timed out';

/** Name given to the error raised when streamText reports it was aborted. */
const TIMEOUT_ERROR_NAME = 'TimeoutError';

/** Stream parts of streamText's `fullStream` this executor acts on. */
const PART_TEXT_DELTA = 'text-delta';
const PART_ERROR = 'error';
const PART_FINISH = 'finish';
const PART_ABORT = 'abort';

/**
 * Reject a finish reason that means the answer is incomplete.
 *
 * enhanceError() prefixes the provider name.
 */
function assertFinished(finishReason: FinishReason | undefined): void {
  if (finishReason === undefined) {
    throw new Error(
      'The response stream ended without a finish event. The result is incomplete and must ' +
        'not be treated as a finished run.'
    );
  }
  if (INCOMPLETE_FINISH_REASONS.has(finishReason)) {
    throw new Error(
      `The model stopped before finishing its answer (finishReason=${finishReason}); the ` +
        `response was truncated. The result is incomplete and must not be treated as a ` +
        `finished run.`
    );
  }
}

/** The error streamText's `abort` part stands for: our timeout aborted the request. */
function streamAbortedError(reason: string | undefined): Error {
  const error = new Error(reason ?? 'The response stream was aborted');
  error.name = TIMEOUT_ERROR_NAME;
  return error;
}

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
        abortSignal: options?.abortSignal,
      });

      assertFinished(response.finishReason);

      return {
        result: response.text,
        sessionId: undefined,
        usage: this.mapUsage(response.usage),
      };
    } catch (error) {
      throw this.enhanceError(error, timeout, options?.abortSignal);
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
        abortSignal: options?.abortSignal,
      });
    } catch (error) {
      throw this.enhanceError(error, timeout, options?.abortSignal);
    }

    let fullText = '';
    /** Set by the stream's `finish` part — its absence means the stream was cut. */
    let finishReason: FinishReason | undefined;
    try {
      for await (const part of streamResult.fullStream) {
        if (part.type === PART_TEXT_DELTA) {
          fullText += part.text;
          yield {
            type: 'progress',
            content: part.text,
            timestamp: new Date(),
          };
        } else if (part.type === PART_ERROR) {
          throw part.error;
        } else if (part.type === PART_FINISH) {
          finishReason = part.finishReason;
        } else if (part.type === PART_ABORT) {
          // streamText reports an abort as a part and then ends the stream
          // cleanly. The source is the `timeout` budget or the caller's
          // abortSignal; enhanceError tells the two apart.
          throw streamAbortedError(part.reason);
        }
      }

      // Same rule as execute(): a fragment is not a finished run.
      assertFinished(finishReason);

      yield {
        type: 'result',
        content: fullText,
        timestamp: new Date(),
      };
    } catch (error) {
      throw this.enhanceError(error, timeout, options?.abortSignal);
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
      abortSignal: options.abortSignal,
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
  private enhanceError(error: unknown, timeout: number, abortSignal?: AbortSignal): Error {
    const provider = this.providerDisplayName;

    // Checked first: the SDK reports a cancelled request with the same error
    // names as a timeout, and a caller's cancel must not read as one.
    if (abortSignal?.aborted) {
      return new Error(`${provider}: ${AGENT_ABORTED_MESSAGE}`);
    }

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
      if (TIMEOUT_ERROR_NAMES.has(error.name) || error.message.includes(TIMED_OUT_TEXT)) {
        // The shared timeout text is what retry classification and the
        // supervisor fail-safe recognise; a provider-specific wording read as
        // `unknown` and the request was re-sent three more times.
        return new Error(`${provider}: ${agentTimeoutMessage(timeout)}`);
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
