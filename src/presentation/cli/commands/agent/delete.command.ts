/**
 * Agent Delete Command
 *
 * Remove an agent run record from the database.
 *
 * Usage:
 *   shep agent delete <id>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { DeleteAgentRunUseCase } from '@/application/use-cases/agents/delete-agent-run.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { resolveAgentRun } from './resolve-run.js';
import { getCliI18n } from '../../i18n.js';
import { refuseStoppingOwnRun } from '@/domain/shared/agent-run-environment.js';
import { reportAgentRunRefusal } from '../agent-run-guard.js';

export function createDeleteCommand(): Command {
  const t = getCliI18n().t;
  return new Command('delete')
    .description(t('cli:commands.agent.delete.description'))
    .argument('<id>', t('cli:commands.agent.delete.idArgument'))
    .option('--force', t('cli:commands.agent.delete.forceOption'))
    .action(async (id: string, opts: { force?: boolean }) => {
      try {
        const resolved = await resolveAgentRun(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }

        if (opts.force && resolved.run.status === 'running') {
          // Stopping first is the part that would kill a caller that IS this run.
          const refusal = refuseStoppingOwnRun(
            process.env,
            {
              runId: resolved.run.id,
              ...(resolved.run.featureId ? { featureId: resolved.run.featureId } : {}),
            },
            false,
            `Stop it explicitly first: shep agent stop ${resolved.run.id} --force`
          );
          if (reportAgentRunRefusal(refusal)) return;

          // Force delete: stop first, then delete
          const { StopAgentRunUseCase } = await import(
            '@/application/use-cases/agents/stop-agent-run.use-case.js'
          );
          const stopUseCase = container.resolve(StopAgentRunUseCase);
          await stopUseCase.execute(resolved.run.id);
        }

        const useCase = container.resolve(DeleteAgentRunUseCase);
        const result = await useCase.execute(resolved.run.id);

        if (result.deleted) {
          messages.success(
            t('cli:commands.agent.delete.deletedSuccess', {
              id: colors.accent(resolved.run.id.substring(0, 8)),
            })
          );
        } else {
          messages.error(result.reason);
          process.exitCode = 1;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.agent.delete.failedToDelete'), err);
        process.exitCode = 1;
      }
    });
}
