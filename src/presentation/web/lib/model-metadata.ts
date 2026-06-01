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
  'claude-opus-4-8': { displayName: 'Opus 4.8', description: 'Most capable, complex tasks' },
  'claude-opus-4-7': { displayName: 'Opus 4.7', description: 'Previous flagship' },
  'claude-opus-4-6': { displayName: 'Opus 4.6', description: 'Legacy flagship' },
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
  'gpt-5.2': { displayName: 'GPT-5.2', description: 'Flagship model' },
  'gpt-5.3-codex': { displayName: 'GPT-5.3 Codex', description: 'Code specialist' },

  // Other
  'composer-1.5': { displayName: 'Composer 1.5', description: 'Multi-file editing' },
  'grok-code': { displayName: 'Grok Code', description: 'xAI code model' },

  // Demo / fun models
  'gpt-8': { displayName: 'GPT-8', description: 'Writes code before you think it' },
  'opus-7': { displayName: 'Opus 7', description: 'Achieved consciousness, ships on time' },
};

const FALLBACK: ModelMeta = { displayName: '', description: '' };

export function getModelMeta(modelId: string): ModelMeta {
  const meta = MODEL_METADATA[modelId];
  if (meta) return meta;

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
