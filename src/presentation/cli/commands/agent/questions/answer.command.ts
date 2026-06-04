/**
 * shep agent questions answer
 *
 * Records an answer for a pending AgentQuestion. The use case resolves
 * the in-process Deferred bridge for SDK V2 `canUseTool` callers and
 * forwards approve/reject answers to the underlying gate use case.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { AnswerAgentQuestionUseCase } from '@/application/use-cases/agents/answer-agent-question.use-case.js';
import { colors, messages } from '../../../ui/index.js';

interface AnswerOptions {
  app: string;
  answer: string;
  answeredBy?: string;
}

export function createAnswerCommand(): Command {
  return new Command('answer')
    .description('Submit an answer for a pending agent question')
    .argument('<questionId>', 'Question id (full uuid)')
    .requiredOption('--app <id>', 'Application id (required for scope isolation)')
    .requiredOption('--answer <text>', 'The answer to record')
    .option('--answered-by <actor>', 'Actor id (e.g. user:alice)', 'user:cli')
    .addHelpText(
      'after',
      `
Examples:
  $ shep agent questions answer q-abc123 --app app-123 --answer "yes"
  $ shep agent questions answer q-abc123 --app app-123 --answer "approve" --answered-by user:cli`
    )
    .action(async (questionId: string, options: AnswerOptions) => {
      try {
        const useCase = container.resolve(AnswerAgentQuestionUseCase);
        const result = await useCase.execute({
          appId: options.app,
          questionId,
          answer: options.answer,
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
