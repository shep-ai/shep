/**
 * shep supervisor reject --run <id> --reason <text>
 *
 * Rejects an agent run on behalf of a delegated supervisor, recording
 * the decision under the `supervisor:<id>` actor namespace.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import { supervisorActor } from '@/domain/value-objects/supervisor-actor.js';
import { colors, messages } from '../../ui/index.js';

interface RejectOptions {
  run: string;
  reason: string;
  supervisorId?: string;
}

export function createRejectCommand(): Command {
  return new Command('reject')
    .description('Reject a waiting agent run as the supervisor')
    .requiredOption('--run <id>', 'Agent run id to reject')
    .requiredOption('--reason <text>', 'Reason for rejection')
    .option('--supervisor-id <id>', 'Supervisor identity for the audit trail', 'cli')
    .addHelpText(
      'after',
      `
Examples:
  $ shep supervisor reject --run <run-id> --reason "Unsafe tool call"
  $ shep supervisor reject --run <run-id> --reason "Missing test coverage" --supervisor-id cli`
    )
    .action(async (options: RejectOptions) => {
      try {
        const actor = supervisorActor(options.supervisorId ?? 'cli');
        const useCase = container.resolve(RejectAgentRunUseCase);
        const result = await useCase.execute(options.run, options.reason, undefined, actor);

        if (!result.rejected) {
          throw new Error(result.reason);
        }

        messages.newline();
        messages.warning(`Run ${options.run} rejected by ${colors.info(actor.value)}`);
        if (result.iteration !== undefined) {
          console.log(`  ${colors.muted('iteration')} ${result.iteration}`);
        }
        if (result.iterationWarning) {
          messages.warning('Iteration limit warning — agent will retry but may need attention');
        }
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to reject agent run', err);
        process.exitCode = 1;
      }
    });
}
