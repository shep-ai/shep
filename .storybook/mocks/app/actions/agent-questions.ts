import type { AgentQuestion, DecisionResponse } from '@shepai/core/domain/generated/output';

export async function listAgentQuestions(_input: {
  appId: string;
}): Promise<{ ok: true; questions: AgentQuestion[] }> {
  return { ok: true, questions: [] };
}

export async function answerAgentQuestion(_input: {
  appId: string;
  questionId: string;
  answer?: string;
  responses?: DecisionResponse[];
  answeredBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  return { ok: true };
}

export async function cancelAgentQuestion(_input: {
  appId: string;
  questionId: string;
  cancelledBy: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  return { ok: true };
}
