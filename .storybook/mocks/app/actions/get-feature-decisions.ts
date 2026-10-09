import type { AgentQuestion } from '@shepai/core/domain/generated/output';

export async function getFeatureDecisions(
  _featureId: string
): Promise<{ decisions: AgentQuestion[] } | { error: string }> {
  return { decisions: [] };
}
