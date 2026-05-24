/**
 * Agent Approve Command
 *
 * Approves a paused agent run (waiting_approval) and resumes execution.
 *
 * Usage:
 *   shep agent approve <id>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { resolveAgentRun } from './resolve-run.js';
import { getCliI18n } from '../../i18n.js';

export function createApproveCommand(): Command {
  const t = getCliI18n().t;
  return new Command('approve')
    .description(t('cli:commands.agent.approve.description'))
    .argument('<id>', t('cli:commands.agent.approve.idArgument'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep agent approve <id>       Approve a paused agent run
  $ shep agent approve a1b2c3d4   Resume a run waiting for approval`
    )
    .action(async (id: string) => {
      try {
        const resolved = await resolveAgentRun(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }

        const useCase = container.resolve(ApproveAgentRunUseCase);
        const result = await useCase.execute(resolved.run.id);

        if (result.approved) {
          messages.success(
            t('cli:commands.agent.approve.approvedSuccess', {
              id: colors.accent(resolved.run.id.substring(0, 8)),
              reason: result.reason,
            })
          );
        } else {
          messages.error(result.reason);
          process.exitCode = 1;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.agent.approve.failedToApprove'), err);
        process.exitCode = 1;
      }
    });
}
