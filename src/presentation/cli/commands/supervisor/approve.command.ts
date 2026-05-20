/**
 * shep supervisor approve --run <id>
 *
 * Approves an agent run on behalf of a delegated supervisor. Uses the
 * `supervisor:<id>` actor namespace so the audit trail records that the
 * decision came from the guardian rather than the human user. The
 * existing "user always wins" guard inside ApproveAgentRunUseCase
 * blocks supervisor overrides of prior user decisions on the same gate.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import { supervisorActor } from '@/domain/value-objects/supervisor-actor.js';
import { colors, messages } from '../../ui/index.js';

interface ApproveOptions {
  run: string;
  supervisorId?: string;
}

export function createApproveCommand(): Command {
  return new Command('approve')
    .description('Approve a waiting agent run as the supervisor')
    .requiredOption('--run <id>', 'Agent run id to approve')
    .option('--supervisor-id <id>', 'Supervisor identity for the audit trail', 'cli')
    .addHelpText(
      'after',
      `
Examples:
  $ shep supervisor approve --run <run-id>
  $ shep supervisor approve --run <run-id> --supervisor-id cli`
    )
    .action(async (options: ApproveOptions) => {
      try {
        const actor = supervisorActor(options.supervisorId ?? 'cli');
        const useCase = container.resolve(ApproveAgentRunUseCase);
        const result = await useCase.execute(options.run, undefined, actor);

        if (!result.approved) {
          throw new Error(result.reason);
        }

        messages.newline();
        messages.success(`Run ${options.run} approved by ${colors.info(actor.value)}`);
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to approve agent run', err);
        process.exitCode = 1;
      }
    });
}
