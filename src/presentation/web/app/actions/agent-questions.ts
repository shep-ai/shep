'use server';

import { resolve } from '@/lib/server-container';
import type { ListAgentQuestionsUseCase } from '@shepai/core/application/use-cases/agents/list-agent-questions.use-case';
import type { AnswerAgentQuestionUseCase } from '@shepai/core/application/use-cases/agents/answer-agent-question.use-case';
import type { CancelAgentQuestionUseCase } from '@shepai/core/application/use-cases/agents/cancel-agent-question.use-case';
import type { AgentQuestion, AgentQuestionStatus } from '@shepai/core/domain/generated/output';
import { requireFeatureFlag } from '@/lib/feature-flags';
import { questionAlreadySettledMessage } from '@shepai/core/domain/shared/agent-question-settlement';

export interface ListAgentQuestionsActionInput {
  appId: string;
  featureId?: string;
  agentRunId?: string;
  status?: AgentQuestionStatus;
  limit?: number;
}

export async function listAgentQuestions(
  input: ListAgentQuestionsActionInput
): Promise<{ ok: true; questions: AgentQuestion[] } | { ok: false; error: string }> {
  if (!input.appId.trim()) {
    return { ok: false, error: 'appId is required' };
  }
  try {
    requireFeatureFlag('collaboration');
    const useCase = resolve<ListAgentQuestionsUseCase>('ListAgentQuestionsUseCase');
    const questions = await useCase.execute(input);
    return { ok: true, questions };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list agent questions';
    return { ok: false, error: message };
  }
}

export interface AnswerAgentQuestionActionInput {
  appId: string;
  questionId: string;
  answer: string;
  answeredBy: string;
}

export async function answerAgentQuestion(
  input: AnswerAgentQuestionActionInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    requireFeatureFlag('collaboration');
    const useCase = resolve<AnswerAgentQuestionUseCase>('AnswerAgentQuestionUseCase');
    const result = await useCase.execute(input);
    if (!result.enabled) {
      return { ok: false, error: 'Collaboration feature flag is off' };
    }
    if (result.alreadySettledAs) {
      return {
        ok: false,
        error: questionAlreadySettledMessage(input.questionId, result.alreadySettledAs),
      };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to answer agent question';
    return { ok: false, error: message };
  }
}

export interface CancelAgentQuestionActionInput {
  appId: string;
  questionId: string;
  cancelledBy: string;
  reason?: string;
}

export async function cancelAgentQuestion(
  input: CancelAgentQuestionActionInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    requireFeatureFlag('collaboration');
    const useCase = resolve<CancelAgentQuestionUseCase>('CancelAgentQuestionUseCase');
    const result = await useCase.execute(input);
    if (!result.enabled) {
      return { ok: false, error: 'Collaboration feature flag is off' };
    }
    if (result.alreadySettledAs) {
      return {
        ok: false,
        error: questionAlreadySettledMessage(input.questionId, result.alreadySettledAs),
      };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel agent question';
    return { ok: false, error: message };
  }
}
