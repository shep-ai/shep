import type { DefaultAgentAndModel } from '@/app/actions/get-default-agent-and-model';

export async function getDefaultAgentAndModel(): Promise<DefaultAgentAndModel> {
  return {
    agentType: 'claude-code',
    model: 'claude-sonnet-4-6',
  };
}
