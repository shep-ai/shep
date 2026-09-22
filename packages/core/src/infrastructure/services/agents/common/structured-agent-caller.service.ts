import { injectable, inject } from 'tsyringe';
import { AgentFeature } from '../../../../domain/generated/output.js';
import type { IAgentExecutorProvider } from '../../../../application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentExecutorFactory } from '../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import type { IAgentExecutor } from '../../../../application/ports/output/agents/agent-executor.interface.js';
import type {
  IStructuredAgentCaller,
  StructuredCallOptions,
} from '../../../../application/ports/output/agents/structured-agent-caller.interface.js';
import { StructuredCallError } from '../../../../application/ports/output/agents/structured-call-error.js';
import { getSettings } from '../../settings.service.js';
import { DEFAULT_AGENT_CALL_TIMEOUT_MS } from './agent-timeouts.js';

/**
 * Structured agent caller that abstracts native structured output vs prompt-based JSON extraction.
 *
 * Uses the agent's native structured output capability when available,
 * otherwise falls back to prompt-based JSON extraction with brace-depth parsing.
 */
@injectable()
export class StructuredAgentCallerService implements IStructuredAgentCaller {
  constructor(
    @inject('IAgentExecutorProvider')
    private readonly executorProvider: IAgentExecutorProvider,
    @inject('IAgentExecutorFactory')
    private readonly executorFactory: IAgentExecutorFactory
  ) {}

  async call<T>(prompt: string, schema: object, callerOptions?: StructuredCallOptions): Promise<T> {
    // Every call is bounded: a caller that names no timeout would otherwise
    // wait forever on a wedged agent (feature creation, code review, …).
    const options: StructuredCallOptions = {
      ...callerOptions,
      timeout: callerOptions?.timeout ?? DEFAULT_AGENT_CALL_TIMEOUT_MS,
    };
    let executor: IAgentExecutor;
    if (options.agentType) {
      const settings = getSettings();
      executor = this.executorFactory.createExecutor(options.agentType, settings.agent);
    } else {
      executor = await this.executorProvider.getExecutor();
    }

    if (executor.supportsFeature(AgentFeature.structuredOutput)) {
      return this.callWithNativeSchema<T>(executor, prompt, schema, options);
    }
    return this.callWithPromptFallback<T>(executor, prompt, schema, options);
  }

  // Native structured output path
  private async callWithNativeSchema<T>(
    executor: IAgentExecutor,
    prompt: string,
    schema: object,
    options?: StructuredCallOptions
  ): Promise<T> {
    const result = await executor.execute(prompt, { ...options, outputSchema: schema });
    const structured = result.metadata?.structured_output as T | undefined;
    if (structured != null) return structured;
    return this.parseJsonFromText<T>(result.result);
  }

  // Prompt-based fallback path
  private async callWithPromptFallback<T>(
    executor: IAgentExecutor,
    prompt: string,
    schema: object,
    options?: StructuredCallOptions
  ): Promise<T> {
    const wrappedPrompt = this.wrapPromptWithJsonInstructions(prompt, schema);
    const result = await executor.execute(wrappedPrompt, options);
    return this.parseJsonFromText<T>(result.result);
  }

  private wrapPromptWithJsonInstructions(prompt: string, schema: object): string {
    return `${prompt}

IMPORTANT: You MUST respond with ONLY a JSON object matching this schema. No markdown fences, no explanation, no extra text.

JSON Schema:
${JSON.stringify(schema, null, 2)}

Return ONLY the JSON object.`;
  }

  // Extract first JSON object from text using brace-depth tracking
  private parseJsonFromText<T>(text: string): T {
    const start = text.indexOf('{');
    if (start === -1) {
      throw new StructuredCallError('No JSON object found in agent response', 'parse_failed');
    }

    let depth = 0;
    let inString = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (ch === '\\') {
          i++; // skip escaped character
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const jsonStr = text.substring(start, i + 1);
          try {
            return JSON.parse(jsonStr) as T;
          } catch (err) {
            throw new StructuredCallError(
              'Failed to parse JSON from agent response',
              'parse_failed',
              err
            );
          }
        }
      }
    }

    throw new StructuredCallError('Incomplete JSON object in agent response', 'parse_failed');
  }
}
