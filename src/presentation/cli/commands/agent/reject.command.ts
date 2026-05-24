/**
 * Agent Reject Command
 *
 * Rejects a paused agent run (waiting_approval) and cancels it.
 *
 * Usage:
 *   shep agent reject <id> [--reason <text>]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { resolveAgentRun } from './resolve-run.js';
import { getCliI18n } from '../../i18n.js';

export function createRejectCommand(): Command {
  const t = getCliI18n().t;
  return new Command('reject')
    .description(t('cli:commands.agent.reject.description'))
    .argument('<id>', t('cli:commands.agent.reject.idArgument'))
    .option('-r, --reason <text>', t('cli:commands.agent.reject.reasonOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep agent reject <id>                 Reject a paused agent run
  $ shep agent reject <id> -r "Needs fix"  Reject with a short reason`
    )
    .action(async (id: string, opts: { reason?: string }) => {
      try {
        const resolved = await resolveAgentRun(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }

        const useCase = container.resolve(RejectAgentRunUseCase);
        const result = await useCase.execute(resolved.run.id, opts.reason ?? 'Rejected by user');

        if (result.rejected) {
          messages.success(
            t('cli:commands.agent.reject.rejectedSuccess', {
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
        messages.error(t('cli:commands.agent.reject.failedToReject'), err);
        process.exitCode = 1;
      }
    });
}
