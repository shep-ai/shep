/**
 * Workflow Delete Command
 *
 * Delete a workflow (soft-delete). Execution history is preserved
 * subject to the retention policy.
 *
 * Usage:
 *   shep workflow delete <name>
 *   shep workflow delete <name> --force
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { DeleteScheduledWorkflowUseCase } from '@/application/use-cases/scheduled-workflows/delete-scheduled-workflow.use-case.js';
import { colors, messages } from '../../ui/index.js';

export function createDeleteCommand(): Command {
  return new Command('delete')
    .description('Delete a workflow')
    .argument('<name>', 'Workflow name or ID')
    .option('--force', 'Skip confirmation')
    .option('-r, --repo <path>', 'Repository path (defaults to current directory)')
    .action(async (nameOrId: string, options: { force?: boolean; repo?: string }) => {
      try {
        // Confirmation prompt (skip with --force or non-interactive)
        if (!options.force && process.stdin.isTTY) {
          const readline = await import('node:readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(
              `  Delete workflow "${nameOrId}"? This will cancel queued executions. [y/N] `,
              resolve
            );
          });
          rl.close();

          if (answer.toLowerCase() !== 'y') {
            messages.info('Cancelled');
            return;
          }
        }

        const repositoryPath = options.repo ?? process.cwd();
        const useCase = container.resolve(DeleteScheduledWorkflowUseCase);
        const workflow = await useCase.execute(nameOrId, repositoryPath);

        messages.success(`Deleted workflow "${colors.accent(workflow.name)}"`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to delete workflow', err);
        process.exitCode = 1;
      }
    });
}
