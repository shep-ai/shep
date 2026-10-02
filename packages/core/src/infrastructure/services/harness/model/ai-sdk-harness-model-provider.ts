/**
 * Harness model backend on the Vercel AI SDK (spec 119).
 *
 * One `generateText` step per call: tools are declared without `execute`, so
 * the SDK returns tool calls instead of running them, and the harness keeps
 * full control of the loop. Incomplete answers (length, content filter,
 * error) reject — a truncated turn is never reported as a finished one
 * (spec 116).
 */
import {
  generateObject,
  generateText,
  jsonSchema,
  tool,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import {
  HarnessModelIncompleteError,
  type HarnessModelMessage,
  type HarnessModelRequest,
  type HarnessModelResponse,
  type HarnessModelUsage,
  type HarnessObjectRequest,
  type HarnessObjectResponse,
  type IHarnessModelProvider,
} from '../../../../application/ports/output/harness/index.js';

const INCOMPLETE = new Set(['length', 'content-filter', 'error']);
const DEFAULT_TIMEOUT_MS = 300_000;

interface SdkUsage {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
}

function mapUsage(usage: SdkUsage | undefined, providerMetadata: unknown): HarnessModelUsage {
  const cost = (providerMetadata as { openrouter?: { usage?: { cost?: number } } } | undefined)
    ?.openrouter?.usage?.cost;
  return {
    ...(usage?.inputTokens !== undefined && { inputTokens: usage.inputTokens }),
    ...(usage?.outputTokens !== undefined && { outputTokens: usage.outputTokens }),
    ...(usage?.inputTokenDetails?.cacheReadTokens !== undefined && {
      cachedInputTokens: usage.inputTokenDetails.cacheReadTokens,
    }),
    ...(typeof cost === 'number' && { costUsd: cost }),
  };
}

export function toModelMessages(messages: readonly HarnessModelMessage[]): ModelMessage[] {
  return messages.map((m): ModelMessage => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    if (m.role === 'tool') {
      return {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: m.toolCallId,
            toolName: m.toolName,
            output: { type: 'text', value: m.content },
          },
        ],
      };
    }
    const parts: Exclude<Extract<ModelMessage, { role: 'assistant' }>['content'], string> = [];
    if (m.content) parts.push({ type: 'text', text: m.content });
    for (const c of m.toolCalls ?? []) {
      parts.push({ type: 'tool-call', toolCallId: c.id, toolName: c.name, input: c.args });
    }
    return { role: 'assistant', content: parts };
  });
}

export class AiSdkHarnessModelProvider implements IHarnessModelProvider {
  constructor(
    private readonly model: LanguageModelV3,
    readonly modelId: string
  ) {}

  async complete(request: HarnessModelRequest): Promise<HarnessModelResponse> {
    const started = Date.now();
    const tools: ToolSet = Object.fromEntries(
      request.tools.map((t) => [
        t.name,
        tool({ description: t.description, inputSchema: jsonSchema(t.inputSchema) }),
      ])
    );
    const response = await generateText({
      model: this.model,
      system: request.system,
      messages: toModelMessages(request.messages),
      tools,
      ...(request.maxOutputTokens !== undefined && { maxOutputTokens: request.maxOutputTokens }),
      timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      abortSignal: request.abortSignal,
    });
    if (INCOMPLETE.has(response.finishReason)) {
      throw new HarnessModelIncompleteError(response.finishReason);
    }
    return {
      text: response.text,
      toolCalls: response.toolCalls.map((c) => ({
        id: c.toolCallId,
        name: c.toolName,
        args: (c.input ?? {}) as Record<string, unknown>,
      })),
      finishReason: response.finishReason,
      usage: mapUsage(response.usage, response.providerMetadata),
      latencyMs: Date.now() - started,
      modelId: this.modelId,
    };
  }

  async generateObject<T>(request: HarnessObjectRequest): Promise<HarnessObjectResponse<T>> {
    const started = Date.now();
    const response = await generateObject({
      model: this.model,
      system: request.system,
      prompt: request.prompt,
      schema: jsonSchema(request.schema),
      timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      abortSignal: request.abortSignal,
    });
    return {
      object: response.object as T,
      usage: mapUsage(response.usage, response.providerMetadata),
      latencyMs: Date.now() - started,
      modelId: this.modelId,
    };
  }
}
