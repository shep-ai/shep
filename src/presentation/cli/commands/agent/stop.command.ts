/**
 * Agent Stop Command
 *
 * Sends SIGTERM to a running agent and marks it as interrupted (resumable).
 *
 * Usage:
 *   shep agent stop <id>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { StopAgentRunUseCase } from '@/application/use-cases/agents/stop-agent-run.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { resolveAgentRun } from './resolve-run.js';
import { getCliI18n } from '../../i18n.js';

export function createStopCommand(): Command {
  const t = getCliI18n().t;
  return new Command('stop')
    .description(t('cli:commands.agent.stop.description'))
    .argument('<id>', t('cli:commands.agent.stop.idArgument'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep agent stop <id>       Stop a running agent
  $ shep agent stop a1b2c3d4   Interrupt a run by short ID`
    )
    .action(async (id: string) => {
      try {
        const resolved = await resolveAgentRun(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }

        const useCase = container.resolve(StopAgentRunUseCase);
        const result = await useCase.execute(resolved.run.id);

        if (result.stopped) {
          messages.success(
            t('cli:commands.agent.stop.stoppedSuccess', {
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
        messages.error(t('cli:commands.agent.stop.failedToStop'), err);
        process.exitCode = 1;
      }
    });
}
