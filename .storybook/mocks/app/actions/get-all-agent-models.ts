import { getModelMeta } from '@/lib/model-metadata';
import {
  CLAUDE_CODE_MODELS,
  CURSOR_MODELS,
  GEMINI_CLI_MODELS,
  CODEX_CLI_MODELS,
  COPILOT_CLI_MODELS,
  CLINE_MODELS,
  OPENROUTER_MODELS,
  TOGETHER_AI_MODELS,
  DEV_MODELS,
} from '@shepai/core/infrastructure/services/agents/common/agent-model-catalog';

const CATALOG: { agentType: string; label: string; models: string[] }[] = [
  { agentType: 'claude-code', label: 'Claude Code', models: CLAUDE_CODE_MODELS },
  { agentType: 'codex-cli', label: 'Codex CLI', models: CODEX_CLI_MODELS },
  { agentType: 'copilot-cli', label: 'Copilot CLI', models: COPILOT_CLI_MODELS },
  { agentType: 'cursor', label: 'Cursor CLI', models: CURSOR_MODELS },
  { agentType: 'gemini-cli', label: 'Gemini CLI', models: GEMINI_CLI_MODELS },
  { agentType: 'cline', label: 'Cline', models: CLINE_MODELS },
  { agentType: 'openrouter', label: 'OpenRouter', models: OPENROUTER_MODELS },
  { agentType: 'together-ai', label: 'Together AI', models: TOGETHER_AI_MODELS },
  { agentType: 'dev', label: 'Demo', models: DEV_MODELS },
];

export async function getAllAgentModels() {
  return CATALOG.map(({ agentType, label, models }) => ({
    agentType,
    label,
    models: models.map((id) => ({ id, ...getModelMeta(id) })),
  }));
}
