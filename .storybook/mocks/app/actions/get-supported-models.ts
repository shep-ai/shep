import { CLAUDE_CODE_MODELS } from '@shepai/core/infrastructure/services/agents/common/agent-model-catalog';

export async function getSupportedModels(): Promise<string[]> {
  return CLAUDE_CODE_MODELS;
}
