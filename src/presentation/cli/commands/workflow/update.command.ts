/**
 * Workflow Update Command
 *
 * Update an existing workflow's fields (partial update).
 *
 * Usage:
 *   shep workflow update <name> --description "New description"
 *   shep workflow update <name> --prompt "New prompt"
 *   shep workflow update <name> --name "new-name"
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetScheduledWorkflowUseCase } from '@/application/use-cases/scheduled-workflows/get-scheduled-workflow.use-case.js';
import { UpdateScheduledWorkflowUseCase } from '@/application/use-cases/scheduled-workflows/update-scheduled-workflow.use-case.js';
import type { UpdateScheduledWorkflowInput as UpdateWorkflowInput } from '@/application/use-cases/scheduled-workflows/update-scheduled-workflow.use-case.js';
import { colors, messages } from '../../ui/index.js';

function collectToolConstraints(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function createUpdateCommand(): Command {
  return new Command('update')
    .description('Update a workflow')
    .argument('<name>', 'Workflow name or ID')
    .option('-n, --name <name>', 'New workflow name')
    .option('-p, --prompt <prompt>', 'New agent prompt')
    .option('-d, --description <text>', 'New description')
    .option(
      '-t, --tool-constraint <tool>',
      'Replace tool constraints (repeatable)',
      collectToolConstraints,
      []
    )
    .option('-r, --repo <path>', 'Repository path (defaults to current directory)')
    .action(
      async (
        nameOrId: string,
        options: {
          name?: string;
          prompt?: string;
          description?: string;
          toolConstraint: string[];
          repo?: string;
        }
      ) => {
        try {
          const hasUpdates =
            options.name != null ||
            options.prompt != null ||
            options.description != null ||
            options.toolConstraint.length > 0;

          if (!hasUpdates) {
            messages.error(
              'No updates specified. Use --name, --prompt, --description, or --tool-constraint.'
            );
            process.exitCode = 1;
            return;
          }

          const repositoryPath = options.repo ?? process.cwd();

          // Resolve workflow to get its ID
          const getUseCase = container.resolve(GetScheduledWorkflowUseCase);
          const existing = await getUseCase.execute(nameOrId, repositoryPath);

          const input: UpdateWorkflowInput = {
            id: existing.id,
            ...(options.name != null && { name: options.name }),
            ...(options.prompt != null && { prompt: options.prompt }),
            ...(options.description != null && { description: options.description }),
            ...(options.toolConstraint.length > 0 && {
              toolConstraints: options.toolConstraint,
            }),
          };

          const updateUseCase = container.resolve(UpdateScheduledWorkflowUseCase);
          const workflow = await updateUseCase.execute(input);

          messages.newline();
          messages.success(`Workflow "${workflow.name}" updated`);
          if (options.name) {
            console.log(`  ${colors.muted('Name:')} ${colors.accent(workflow.name)}`);
          }
          messages.newline();
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          messages.error('Failed to update workflow', err);
          process.exitCode = 1;
        }
      }
    );
}
