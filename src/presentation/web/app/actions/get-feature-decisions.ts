'use server';

import { resolve } from '@/lib/server-container';
import type { ListAgentQuestionInboxUseCase } from '@shepai/core/application/use-cases/agents/list-agent-question-inbox.use-case';
import type { AgentQuestion } from '@shepai/core/domain/generated/output';

/** The questions a feature's agents asked, newest first (spec 134). */
export async function getFeatureDecisions(
  featureId: string
): Promise<{ decisions: AgentQuestion[] } | { error: string }> {
  if (!featureId.trim()) return { error: 'Feature id is required' };
  try {
    const decisions = await resolve<ListAgentQuestionInboxUseCase>(
      'ListAgentQuestionInboxUseCase'
    ).execute({ featureId });
    return { decisions };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to load decisions' };
  }
}
