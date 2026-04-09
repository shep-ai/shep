'use server';

import { resolve } from '@/lib/server-container';
import { getModelMeta } from '@/lib/model-metadata';
import type { IAgentExecutorFactory } from '@shepai/core/application/ports/output/agents/agent-executor-factory.interface';

export interface ModelInfo {
  id: string;
  displayName: string;
  description: string;
}

export interface AgentModelGroup {
  agentType: string;
  label: string;
  models: ModelInfo[];
}

const AGENT_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  'codex-cli': 'Codex CLI',
  'copilot-cli': 'Copilot CLI',
  cursor: 'Cursor CLI',
  'gemini-cli': 'Gemini CLI',
  openrouter: 'OpenRouter',
  'together-ai': 'Together AI',
  dev: 'Demo',
};

/** Sort weight — higher = further down. Demo always last. */
const AGENT_ORDER: Record<string, number> = {
  'claude-code': 0,
  'codex-cli': 1,
  'copilot-cli': 2,
  cursor: 3,
  'gemini-cli': 4,
  openrouter: 5,
  'together-ai': 6,
  dev: 99,
};

export async function getAllAgentModels(): Promise<AgentModelGroup[]> {
  try {
    const factory = resolve<IAgentExecutorFactory>('IAgentExecutorFactory');
    const agents = factory.getSupportedAgents();
    return agents
      .map((agentType) => ({
        agentType: agentType as string,
        label: AGENT_LABELS[agentType as string] ?? (agentType as string),
        models: factory.getSupportedModels(agentType).map((id) => ({
          id,
          ...getModelMeta(id),
        })),
      }))
      .map((g) => {
        // Dev agent gets fun demo models
        if (g.agentType === 'dev' && g.models.length === 0) {
          return {
            ...g,
            models: [
              { id: 'gpt-8', ...getModelMeta('gpt-8') },
              { id: 'opus-7', ...getModelMeta('opus-7') },
            ],
          };
        }
        return g;
      })
      .filter((g) => g.models.length > 0)
      .sort((a, b) => (AGENT_ORDER[a.agentType] ?? 50) - (AGENT_ORDER[b.agentType] ?? 50));
  } catch {
    return [];
  }
}
