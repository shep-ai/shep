export interface ModelMeta {
  displayName: string;
  description: string;
}

/**
 * Presentation-layer metadata for known LLM model identifiers.
 * Maps raw model IDs to human-friendly display names and short descriptions.
 */
const MODEL_METADATA: Record<string, ModelMeta> = {
  // Claude models
  'claude-fable-5-1': {
    displayName: 'Fable 5.1',
    description: 'Most capable, long-horizon agentic',
  },
  'claude-fable-5': { displayName: 'Fable 5', description: 'Previous Fable flagship' },
  'claude-opus-5-5': { displayName: 'Opus 5.5', description: 'Latest Opus, complex agentic work' },
  'claude-opus-5': { displayName: 'Opus 5', description: 'Previous Opus flagship' },
  'claude-opus-4-8': { displayName: 'Opus 4.8', description: 'Legacy Opus flagship' },
  'claude-opus-4-7': { displayName: 'Opus 4.7', description: 'Legacy Opus flagship' },
  'claude-opus-4-6': { displayName: 'Opus 4.6', description: 'Legacy flagship' },
  'claude-sonnet-5': { displayName: 'Sonnet 5', description: 'Near-Opus quality, fast' },
  'claude-sonnet-4-6': { displayName: 'Sonnet 4.6', description: 'Fast & balanced' },
  'claude-haiku-4-5': { displayName: 'Haiku 4.5', description: 'Lightweight & quick' },

  // Gemini models
  'gemini-3.1-pro-preview': { displayName: 'Gemini 3.1 Pro', description: 'Advanced reasoning' },
  'gemini-3-flash-preview': { displayName: 'Gemini 3 Flash', description: 'Ultra-fast responses' },
  'gemini-2.5-pro': { displayName: 'Gemini 2.5 Pro', description: 'Reliable workhorse' },
  'gemini-2.5-flash': { displayName: 'Gemini 2.5 Flash', description: 'Speed-optimized' },
  'gemini-2.5-flash-lite': {
    displayName: 'Gemini 2.5 Flash Lite',
    description: 'Fastest & lightest',
  },

  // OpenAI models
  'gpt-5.4-high': { displayName: 'GPT-5.4', description: 'Latest reasoning model' },
  'gpt-5.4': { displayName: 'GPT-5.4', description: 'Codex flagship' },
  'gpt-5.4-mini': { displayName: 'GPT-5.4 Mini', description: 'Fast, lower cost' },
  'gpt-5.3-codex': { displayName: 'GPT-5.3 Codex', description: 'Code specialist' },
  'gpt-5.3-codex-spark': {
    displayName: 'GPT-5.3 Codex Spark',
    description: 'Codex 5.3, lower cost',
  },
  'gpt-5.2-codex': { displayName: 'GPT-5.2 Codex', description: 'Previous Codex specialist' },
  'gpt-5.2': { displayName: 'GPT-5.2', description: 'Flagship model' },
  'gpt-5.1-codex-max': { displayName: 'GPT-5.1 Codex Max', description: 'Long-context Codex' },
  'gpt-5.1-codex': { displayName: 'GPT-5.1 Codex', description: 'Codex 5.1' },
  'gpt-5.1': { displayName: 'GPT-5.1', description: 'Legacy reasoning model' },
  'gpt-5-codex': { displayName: 'GPT-5 Codex', description: 'Original Codex specialist' },
  'gpt-5-codex-mini': {
    displayName: 'GPT-5 Codex Mini',
    description: 'Original Codex, lightweight',
  },
  'gpt-5': { displayName: 'GPT-5', description: 'Legacy flagship' },

  // Cursor CLI models (static fallback; live list comes from --list-models)
  auto: { displayName: 'Auto', description: 'Cursor default model routing' },
  'composer-2.5': { displayName: 'Composer 2.5', description: 'Cursor coding model' },
  'composer-2.5-fast': {
    displayName: 'Composer 2.5 Fast',
    description: 'Faster Composer 2.5 variant',
  },
  // Legacy id kept for old settings rows that still store composer-1.5
  'composer-1.5': { displayName: 'Composer 1.5', description: 'Legacy multi-file editing' },
  'grok-code': { displayName: 'Grok Code', description: 'xAI code model (legacy id)' },
  'cursor-grok-4.6-high': { displayName: 'Grok 4.6', description: 'xAI Grok via Cursor' },
  'claude-opus-5-high': { displayName: 'Opus 5', description: 'Claude Opus 5 via Cursor' },
  'claude-sonnet-5-high': { displayName: 'Sonnet 5', description: 'Claude Sonnet 5 via Cursor' },
  'claude-4.6-sonnet-medium': {
    displayName: 'Sonnet 4.6',
    description: 'Claude Sonnet 4.6 via Cursor',
  },
  'gemini-3.1-pro': { displayName: 'Gemini 3.1 Pro', description: 'Advanced reasoning' },
  // Legacy preview id still used by other agents' catalogs
  // (keep single entry — displayName covers both shapes via getModelMeta fallback if needed)

  // Z.ai models
  'z-ai/glm-5.3': {
    displayName: 'GLM-5.3 (OpenRouter API)',
    description: 'Z.ai 1M-context coding flagship (OpenRouter API)',
  },
  'glm-5.2': { displayName: 'GLM-5.2', description: 'Z.ai 1M-context coding flagship' },
  'glm-5.1': { displayName: 'GLM-5.1', description: 'Z.ai open-weights coding model' },

  // Demo / fun models
  'gpt-8': { displayName: 'GPT-8', description: 'Writes code before you think it' },
  'opus-7': { displayName: 'Opus 7', description: 'Achieved consciousness, ships on time' },
};

const FALLBACK: ModelMeta = { displayName: '', description: '' };

/**
 * `claude-<family>-<major>[-<minor>][-<YYYYMMDD>]` — the shape of every current
 * Anthropic model id. Matching it lets a model discovered at runtime render as
 * "Opus 5.5" instead of the generic prettifier's "Opus 5 5".
 */
const CLAUDE_MODEL_ID = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i;

function formatClaudeModelId(modelId: string): string | undefined {
  const match = CLAUDE_MODEL_ID.exec(modelId);
  if (!match) return undefined;
  const [, family, major, minor] = match;
  const version = minor ? `${major}.${minor}` : major;
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${version}`;
}

export function getModelMeta(modelId: string): ModelMeta {
  const meta = MODEL_METADATA[modelId];
  if (meta) return meta;

  const claudeName = formatClaudeModelId(modelId);
  if (claudeName) return { ...FALLBACK, displayName: claudeName };

  // Fallback: prettify the raw ID. Provider/model IDs like
  // 'anthropic/claude-sonnet-4.5' are split and we keep only the model portion,
  // then apply the same prefix-stripping used for bare claude/gemini/gpt IDs.
  const bare = modelId.includes('/') ? (modelId.split('/').pop() ?? modelId) : modelId;
  return {
    ...FALLBACK,
    displayName: bare
      .replace(/^claude-/i, '')
      .replace(/^gemini-/i, 'Gemini ')
      .replace(/^gpt-/i, 'GPT-')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}
