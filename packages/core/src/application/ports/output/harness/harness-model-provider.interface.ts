/**
 * Coding-model port of the harness (spec 119, docs/14 "ModelProvider").
 *
 * One single-step call per turn: the runtime owns the loop, so the provider
 * must never auto-continue after a tool call. Provider SDKs stay in
 * infrastructure; this port speaks plain messages and JSON-schema tools.
 */

export interface HarnessToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface HarnessToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type HarnessModelMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: HarnessToolCallRequest[] }
  | { role: 'tool'; toolCallId: string; toolName: string; content: string };

export interface HarnessModelUsage {
  /** Total input tokens, cached ones included (counted once). */
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costUsd?: number;
}

export interface HarnessModelRequest {
  system: string;
  messages: HarnessModelMessage[];
  tools: HarnessToolSpec[];
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

export interface HarnessModelResponse {
  text: string;
  toolCalls: HarnessToolCallRequest[];
  finishReason: string;
  usage: HarnessModelUsage;
  latencyMs: number;
  modelId: string;
}

export interface HarnessObjectRequest {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

export interface HarnessObjectResponse<T> {
  object: T;
  usage: HarnessModelUsage;
  latencyMs: number;
  modelId: string;
}

export interface IHarnessModelProvider {
  readonly modelId: string;
  complete(request: HarnessModelRequest): Promise<HarnessModelResponse>;
  generateObject<T>(request: HarnessObjectRequest): Promise<HarnessObjectResponse<T>>;
}

/** Thrown when the model's answer is incomplete (length, content filter, error). */
export class HarnessModelIncompleteError extends Error {
  constructor(readonly finishReason: string) {
    super(`Model response incomplete (finish reason: ${finishReason})`);
    this.name = 'HarnessModelIncompleteError';
  }
}
