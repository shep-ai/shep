/**
 * Structured Agent Caller Interface
 *
 * Output port for making typed, schema-validated calls to AI agents.
 * Abstracts away differences between agents that natively support
 * structured output (e.g., Claude Code --json-schema) and those
 * that require prompt-based JSON extraction.
 *
 * @example
 * ```typescript
 * interface FeatureMeta { slug: string; name: string; description: string }
 *
 * const caller = container.resolve<IStructuredAgentCaller>('IStructuredAgentCaller');
 * const meta = await caller.call<FeatureMeta>(
 *   'Analyze this request and extract feature metadata: "Add OAuth login"',
 *   {
 *     type: 'object',
 *     properties: {
 *       slug: { type: 'string' },
 *       name: { type: 'string' },
 *       description: { type: 'string' },
 *     },
 *     required: ['slug', 'name', 'description'],
 *     additionalProperties: false,
 *   },
 *   { maxTurns: 10, silent: true }
 * );
 * ```
 */

import type { AgentType } from '../../../../domain/generated/output.js';
import type { AgentExecutionOptions } from './agent-executor.interface.js';

/**
 * Options for structured agent calls.
 * Same as AgentExecutionOptions but without outputSchema (provided separately as the schema argument).
 * Optionally accepts agentType to override the default executor resolved from settings.
 */
export type StructuredCallOptions = Omit<AgentExecutionOptions, 'outputSchema'> & {
  /** Override executor agent type instead of using the default from settings */
  agentType?: AgentType;
};

/**
 * Port interface for making typed calls to AI agents with JSON schema output.
 *
 * Implementations handle the difference between agents with native structured
 * output support and those requiring prompt-based JSON extraction.
 */
export interface IStructuredAgentCaller {
  /**
   * Execute a prompt and return a typed result matching the given JSON schema.
   *
   * @typeParam T - The expected return type matching the schema
   * @param prompt - The prompt to send to the agent
   * @param schema - JSON Schema object describing the expected output shape
   * @param options - Optional execution configuration (cwd, maxTurns, silent, etc.).
   *   When `timeout` is omitted the implementation applies its default agent
   *   call budget — a call is never unbounded.
   * @returns Parsed and typed result from the agent
   * @throws {StructuredCallError} When the agent response cannot be parsed as valid JSON
   */
  call<T>(prompt: string, schema: object, options?: StructuredCallOptions): Promise<T>;
}
