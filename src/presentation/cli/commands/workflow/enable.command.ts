/**
 * Workflow Enable Command
 *
 * Enable a workflow's schedule.
 *
 * Usage:
 *   shep workflow enable <name>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ToggleScheduledWorkflowUseCase } from '@/application/use-cases/scheduled-workflows/toggle-scheduled-workflow.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { formatTimestamp } from './format-helpers.js';

export function createEnableCommand(): Command {
  return new Command('enable')
    .description('Enable a workflow schedule')
    .argument('<name>', 'Workflow name or ID')
    .option('-r, --repo <path>', 'Repository path (defaults to current directory)')
    .action(async (nameOrId: string, options: { repo?: string }) => {
      try {
        const repositoryPath = options.repo ?? process.cwd();
        const useCase = container.resolve(ToggleScheduledWorkflowUseCase);
        const workflow = await useCase.execute(nameOrId, true, repositoryPath);

        messages.success(`Workflow "${workflow.name}" enabled`);
        if (workflow.nextRunAt) {
          console.log(
            `  ${colors.muted('Next run:')} ${formatTimestamp(new Date(workflow.nextRunAt))}`
          );
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to enable workflow', err);
        process.exitCode = 1;
      }
    });
}
