/**
 * LanguageModelFactory (spec 119): one place that turns an SDK agent type and
 * its credential into a Vercel AI SDK language model.
 *
 * The OpenRouter, Together AI, Ollama and LLMProxy executors and the Shep
 * Harness backend all build models here, so provider construction (base URLs,
 * dummy keys for local servers, URL hardening) is never duplicated.
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { AgentType } from '../../../../domain/generated/output.js';

export const OPENROUTER_DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5';
export const TOGETHER_AI_BASE_URL = 'https://api.together.xyz/v1';
export const TOGETHER_AI_DEFAULT_MODEL = 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8';
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434/v1';
export const OLLAMA_DEFAULT_MODEL = 'llama3.2';
export const LLMPROXY_DEFAULT_BASE_URL = 'http://localhost:4000/v1';
export const LLMPROXY_DEFAULT_MODEL = 'gpt-4o';

/** Environment variables consulted when no credential is configured (spec 119). */
export const SDK_CREDENTIAL_ENV: Partial<Record<AgentType, string>> = {
  [AgentType.OpenRouter]: 'OPENROUTER_API_KEY',
  [AgentType.TogetherAi]: 'TOGETHER_API_KEY',
  [AgentType.Ollama]: 'OLLAMA_BASE_URL',
  [AgentType.LlmProxy]: 'LLMPROXY_BASE_URL',
};

/** SDK agents whose model access the harness can reuse. */
export const SDK_BACKEND_TYPES: readonly AgentType[] = [
  AgentType.OpenRouter,
  AgentType.TogetherAi,
  AgentType.Ollama,
  AgentType.LlmProxy,
];

export interface LanguageModelSource {
  readonly agentType: AgentType;
  readonly defaultModel: string;
  model(modelId?: string): LanguageModelV3;
}

/**
 * Ollama and LLMProxy take a BASE URL where every other agent takes an API key,
 * because both front a local server. The settings field is nonetheless called
 * `token`, so a user who pastes a key there would send it as a URL — and a
 * hostile value such as a cloud metadata endpoint would receive the full
 * prompt, which contains the source of the repository being worked on.
 *
 * Accept the value only when it is a plausible base URL, and refuse the
 * link-local metadata range outright. Anything else falls back to the
 * executor's own default.
 */
export function resolveLocalProviderBaseUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  // 169.254.0.0/16 — cloud instance metadata lives here on every major provider.
  if (parsed.hostname.startsWith('169.254.')) return undefined;

  return trimmed;
}

/**
 * Build a model source for an SDK agent. `credential` is the API key for
 * hosted providers and the base URL for local ones (Ollama, LLMProxy).
 */
export function createLanguageModelSource(
  agentType: AgentType,
  credential?: string
): LanguageModelSource {
  switch (agentType) {
    case AgentType.OpenRouter: {
      const provider = createOpenRouter({ apiKey: credential ?? '' });
      return {
        agentType,
        defaultModel: OPENROUTER_DEFAULT_MODEL,
        model: (id) => provider.chat(id ?? OPENROUTER_DEFAULT_MODEL),
      };
    }
    case AgentType.TogetherAi: {
      const provider = createOpenAICompatible({
        name: 'together-ai',
        baseURL: TOGETHER_AI_BASE_URL,
        apiKey: credential ?? '',
      });
      return {
        agentType,
        defaultModel: TOGETHER_AI_DEFAULT_MODEL,
        model: (id) => provider.chatModel(id ?? TOGETHER_AI_DEFAULT_MODEL),
      };
    }
    case AgentType.Ollama: {
      const provider = createOpenAICompatible({
        name: 'ollama',
        baseURL: credential ?? OLLAMA_DEFAULT_BASE_URL,
        apiKey: 'ollama',
      });
      return {
        agentType,
        defaultModel: OLLAMA_DEFAULT_MODEL,
        model: (id) => provider.chatModel(id ?? OLLAMA_DEFAULT_MODEL),
      };
    }
    case AgentType.LlmProxy: {
      const provider = createOpenAICompatible({
        name: 'llmproxy',
        baseURL: credential ?? LLMPROXY_DEFAULT_BASE_URL,
        apiKey: 'llmproxy',
      });
      return {
        agentType,
        defaultModel: LLMPROXY_DEFAULT_MODEL,
        model: (id) => provider.chatModel(id ?? LLMPROXY_DEFAULT_MODEL),
      };
    }
    default:
      throw new Error(
        `${agentType} is not an SDK agent; choose one of ${SDK_BACKEND_TYPES.join(', ')}`
      );
  }
}
