/**
 * Workflow Disable Command
 *
 * Disable a workflow's schedule (manual triggers still allowed).
 *
 * Usage:
 *   shep workflow disable <name>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ToggleScheduledWorkflowUseCase } from '@/application/use-cases/scheduled-workflows/toggle-scheduled-workflow.use-case.js';
import { messages } from '../../ui/index.js';

export function createDisableCommand(): Command {
  return new Command('disable')
    .description('Disable a workflow schedule')
    .argument('<name>', 'Workflow name or ID')
    .option('-r, --repo <path>', 'Repository path (defaults to current directory)')
    .action(async (nameOrId: string, options: { repo?: string }) => {
      try {
        const repositoryPath = options.repo ?? process.cwd();
        const useCase = container.resolve(ToggleScheduledWorkflowUseCase);
        const workflow = await useCase.execute(nameOrId, false, repositoryPath);

        messages.success(`Workflow "${workflow.name}" disabled`);
        messages.info('Manual triggers are still allowed via: shep workflow run <name>');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to disable workflow', err);
        process.exitCode = 1;
      }
    });
}
