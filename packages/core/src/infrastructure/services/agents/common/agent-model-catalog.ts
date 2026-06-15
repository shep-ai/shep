/**
 * Static model catalog — one source of truth for all per-agent model lists.
 *
 * These lists are used by AgentExecutorFactory.getSupportedModels() and by
 * the web presentation layer (server actions + Storybook mocks) for dropdowns
 * and model-selection UI.  Update here when new models are released or old
 * ones are retired.
 */

export const CLAUDE_CODE_MODELS: string[] = [
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'glm-5.2',
  'glm-5.1',
];

export const GEMINI_CLI_MODELS: string[] = [
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

export const CURSOR_MODELS: string[] = [
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'gpt-5.4-high',
  'gpt-5.2',
  'gpt-5.3-codex',
  'gemini-3.1-pro-preview',
  'composer-1.5',
  'grok-code',
];

export const CODEX_CLI_MODELS: string[] = [
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.3-codex-spark',
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex',
  'gpt-5.1',
  'gpt-5-codex',
  'gpt-5-codex-mini',
  'gpt-5',
];

export const COPILOT_CLI_MODELS: string[] = [
  'claude-haiku-4.5',
  'claude-opus-4.5',
  'claude-opus-4.6',
  'claude-opus-4.7',
  'claude-opus-4.8',
  'claude-sonnet-4',
  'claude-sonnet-4.5',
  'claude-sonnet-4.6',
  'gpt-4.1',
  'gpt-5-mini',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.3-codex',
  'gpt-5.4',
  'gpt-5.4-mini',
];

export const CLINE_MODELS: string[] = [
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
  'gpt-4.1',
  'gpt-4.1-mini',
  'deepseek-chat',
  'llama3.2',
];

export const OPENROUTER_MODELS: string[] = [
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5.4',
  'openai/gpt-5.2',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-4-scout',
  'google/gemini-3-flash-preview',
  'google/gemini-3.1-pro-preview',
  'deepseek/deepseek-chat-v3-0324',
  'mistralai/mistral-large-latest',
];

export const TOGETHER_AI_MODELS: string[] = [
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'deepseek-ai/DeepSeek-V3',
  'deepseek-ai/DeepSeek-R1',
  'mistralai/Mistral-Small-24B-Instruct-2501',
  'google/gemma-2-27b-it',
  'codellama/CodeLlama-70b-Instruct-hf',
];

export const OLLAMA_MODELS: string[] = [
  'llama3.2',
  'llama3.1',
  'codellama',
  'deepseek-coder-v2',
  'qwen2.5-coder',
  'mistral',
  'gemma2',
  'phi3',
  'starcoder2',
];

/** Demo/fun models shown for the `dev` agent type in the UI. */
export const DEV_MODELS: string[] = ['gpt-8', 'opus-7'];
