/**
 * Project Delete Command
 *
 * Delete a PM project (soft delete).
 *
 * Usage:
 *   shep project del <slug>
 *   shep project del <slug> --force
 */

import { Command } from 'commander';
import { confirm } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { GetPmProjectUseCase } from '@/application/use-cases/pm-projects/get-pm-project.use-case.js';
import { DeletePmProjectUseCase } from '@/application/use-cases/pm-projects/delete-pm-project.use-case.js';
import { colors, messages } from '../../ui/index.js';

interface DelOptions {
  force?: boolean;
}

export function createDelCommand(): Command {
  return new Command('del')
    .description('Delete a project')
    .argument('<slug>', 'Project slug or ID')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (slug: string, options: DelOptions) => {
      try {
        const getProject = container.resolve(GetPmProjectUseCase);
        const getResult = await getProject.execute(slug);

        if (!getResult.ok) {
          messages.error(getResult.error);
          process.exitCode = 1;
          return;
        }

        const project = getResult.project;

        if (!options.force) {
          const confirmed = await confirm({
            message: `Delete project "${project.name}" (${project.identifierPrefix})? This cannot be undone.`,
            default: false,
          });
          if (!confirmed) {
            messages.info('Cancelled');
            return;
          }
        }

        const deleteUseCase = container.resolve(DeletePmProjectUseCase);
        const result = await deleteUseCase.execute(project.id);

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        messages.newline();
        messages.success('Project deleted');
        console.log(`  ${colors.muted('Name:')}   ${project.name}`);
        console.log(`  ${colors.muted('Prefix:')} ${project.identifierPrefix}`);
        messages.newline();
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('force closed') || error.message.includes('User force closed'))
        ) {
          messages.info('Cancelled');
          return;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to delete project', err);
        process.exitCode = 1;
      }
    });
}
