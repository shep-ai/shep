'use server';

import { resolve } from '@/lib/server-container';
import type { ListToolsUseCase } from '@shepai/core/application/use-cases/tools/list-tools.use-case';

const AGENT_TOOL_MAP: Record<string, string> = {
  'claude-code': 'claude-code',
  cursor: 'cursor-cli',
  'gemini-cli': 'gemini-cli',
  'copilot-cli': 'copilot-cli',
  'codex-cli': 'codex-cli',
};

export type AgentInstallMap = Record<string, boolean>;

/**
 * Returns a map of agentType → installed (boolean) for all known agents.
 * Agents without a tool mapping (e.g. "dev") are considered installed.
 */
export async function checkAllAgentsStatus(): Promise<AgentInstallMap> {
  try {
    const useCase = resolve<ListToolsUseCase>('ListToolsUseCase');
    const tools = await useCase.execute();

    const result: AgentInstallMap = {};
    for (const [agentType, toolId] of Object.entries(AGENT_TOOL_MAP)) {
      const tool = tools.find((t) => t.id === toolId);
      result[agentType] = tool?.status.status === 'available';
    }
    // Dev/demo agents are always "installed"
    result['dev'] = true;

    return result;
  } catch {
    return {};
  }
}
