/**
 * shep agent questions cancel
 *
 * Marks a pending AgentQuestion as cancelled. Rejects any in-process
 * awaiter so an SDK V2 `canUseTool` callback fails-fast rather than
 * waiting for an answer that will never come.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { CancelAgentQuestionUseCase } from '@/application/use-cases/agents/cancel-agent-question.use-case.js';
import { colors, messages } from '../../../ui/index.js';

interface CancelOptions {
  app: string;
  reason?: string;
  cancelledBy?: string;
}

export function createCancelCommand(): Command {
  return new Command('cancel')
    .description('Cancel a pending agent question')
    .argument('<questionId>', 'Question id (full uuid)')
    .requiredOption('--app <id>', 'Application id (required for scope isolation)')
    .option('--reason <text>', 'Optional reason recorded as the answer field')
    .option('--cancelled-by <actor>', 'Actor id (e.g. user:alice)', 'user:cli')
    .addHelpText(
      'after',
      `
Examples:
  $ shep agent questions cancel q-abc123 --app app-123
  $ shep agent questions cancel q-abc123 --app app-123 --reason "No longer needed"
  $ shep agent questions cancel q-abc123 --app app-123 --cancelled-by user:alice`
    )
    .action(async (questionId: string, options: CancelOptions) => {
      try {
        const useCase = container.resolve(CancelAgentQuestionUseCase);
        const result = await useCase.execute({
          appId: options.app,
          questionId,
          cancelledBy: options.cancelledBy ?? 'user:cli',
          reason: options.reason,
        });

        if (!result.enabled) {
          throw new Error(
            'Collaboration feature flag is off — enable it before cancelling questions'
          );
        }
        if (!result.question) {
          throw new Error(`Question ${questionId} not found in app ${options.app}`);
        }

        messages.newline();
        messages.warning(`Cancelled question ${colors.info(questionId.slice(0, 8))}`);
        if (options.reason) {
          console.log(`  ${colors.muted('reason')}  ${options.reason}`);
        }
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to cancel agent question', err);
        process.exitCode = 1;
      }
    });
}
