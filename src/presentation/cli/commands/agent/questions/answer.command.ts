/**
 * shep agent questions answer
 *
 * Records an answer for a pending AgentQuestion. The use case resolves
 * the in-process Deferred bridge for SDK V2 `canUseTool` callers and
 * forwards approve/reject answers to the underlying gate use case.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { questionAlreadySettledMessage } from '@/domain/shared/agent-question-settlement.js';
import { AnswerAgentQuestionUseCase } from '@/application/use-cases/agents/answer-agent-question.use-case.js';
import { ListAgentQuestionsUseCase } from '@/application/use-cases/agents/list-agent-questions.use-case.js';
import type { DecisionResponse } from '@/domain/generated/output.js';
import { decisionForQuestion } from '@/domain/shared/decision-builders.js';
import { colors, messages } from '../../../ui/index.js';
import { promptDecision, renderDecisionLines } from './decision-renderer.js';

interface AnswerOptions {
  app: string;
  answer?: string;
  answeredBy?: string;
}

/**
 * Without `--answer`, show the question's decision and ask it interactively
 * (spec 134) — the same model and recommended defaults the web panel uses.
 */
async function promptForResponses(appId: string, questionId: string): Promise<DecisionResponse[]> {
  if (!process.stdin.isTTY) {
    throw new Error('--answer is required when the terminal is not interactive');
  }
  const questions = await container.resolve(ListAgentQuestionsUseCase).execute({ appId });
  const question = questions.find((q) => q.id === questionId);
  if (!question) throw new Error(`Question ${questionId} not found in app ${appId}`);
  const decision = decisionForQuestion(question);
  messages.newline();
  for (const line of renderDecisionLines(decision)) console.log(`  ${line}`);
  messages.newline();
  return promptDecision(decision);
}

export function createAnswerCommand(): Command {
  return new Command('answer')
    .description('Submit an answer for a pending agent question')
    .argument('<questionId>', 'Question id (full uuid)')
    .requiredOption('--app <id>', 'Application id (required for scope isolation)')
    .option('--answer <text>', 'The answer to record (omit to choose interactively)')
    .option('--answered-by <actor>', 'Actor id (e.g. user:alice)', 'user:cli')
    .action(async (questionId: string, options: AnswerOptions) => {
      try {
        const answer =
          options.answer !== undefined
            ? { answer: options.answer }
            : { responses: await promptForResponses(options.app, questionId) };
        const useCase = container.resolve(AnswerAgentQuestionUseCase);
        const result = await useCase.execute({
          appId: options.app,
          questionId,
          ...answer,
          answeredBy: options.answeredBy ?? 'user:cli',
        });

        if (!result.enabled) {
          throw new Error(
            'Collaboration feature flag is off — enable it before answering questions'
          );
        }
        if (!result.question) {
          throw new Error(`Question ${questionId} not found in app ${options.app}`);
        }
        if (result.alreadySettledAs) {
          throw new Error(questionAlreadySettledMessage(questionId, result.alreadySettledAs));
        }

        messages.newline();
        messages.success(`Answered question ${colors.info(questionId.slice(0, 8))}`);
        if (result.forwardedToGate) {
          console.log(
            `  ${colors.muted('forwarded')}  approval gate decision recorded for the underlying agent run`
          );
        }
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to answer agent question', err);
        process.exitCode = 1;
      }
    });
}
