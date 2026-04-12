/**
 * Item New Command
 *
 * Create a new work item in a project.
 *
 * Usage:
 *   shep item new <project>
 *   shep item new <project> --title "Fix login bug" --priority high
 *   shep item new <project> --title "Sub-task" --parent PROJ-42
 */

import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { GetPmProjectUseCase } from '@/application/use-cases/pm-projects/get-pm-project.use-case.js';
import { CreateWorkItemUseCase } from '@/application/use-cases/work-items/create-work-item.use-case.js';
import { GetWorkItemUseCase } from '@/application/use-cases/work-items/get-work-item.use-case.js';
import { Priority } from '@/domain/generated/output.js';
import { colors, messages } from '../../ui/index.js';

interface NewOptions {
  title?: string;
  priority?: string;
  description?: string;
  parent?: string;
}

const PRIORITY_CHOICES = [
  { name: 'None', value: Priority.None },
  { name: 'Low', value: Priority.Low },
  { name: 'Medium', value: Priority.Medium },
  { name: 'High', value: Priority.High },
  { name: 'Urgent', value: Priority.Urgent },
];

export function createNewCommand(): Command {
  return new Command('new')
    .description('Create a new work item')
    .argument('<project>', 'Project slug or identifier prefix')
    .option('-t, --title <title>', 'Work item title')
    .option('-p, --priority <priority>', 'Priority (none, low, medium, high, urgent)')
    .option('-d, --description <description>', 'Work item description')
    .option('--parent <identifier>', 'Parent work item identifier (e.g. PROJ-42)')
    .action(async (projectSlug: string, options: NewOptions) => {
      try {
        const getProject = container.resolve(GetPmProjectUseCase);
        const projectResult = await getProject.execute(projectSlug);

        if (!projectResult.ok) {
          messages.error(projectResult.error);
          process.exitCode = 1;
          return;
        }

        const project = projectResult.project;

        const title =
          options.title ??
          (await input({
            message: 'Work item title:',
            validate: (v) => (v.trim().length > 0 ? true : 'Title is required'),
          }));

        let priority: Priority;
        if (options.priority) {
          const normalized =
            options.priority.charAt(0).toUpperCase() + options.priority.slice(1).toLowerCase();
          const match = PRIORITY_CHOICES.find((c) => c.name === normalized);
          priority = match?.value ?? Priority.None;
        } else {
          priority = await select({
            message: 'Priority:',
            choices: PRIORITY_CHOICES,
            default: Priority.None,
          });
        }

        let parentId: string | undefined;
        if (options.parent) {
          const getItem = container.resolve(GetWorkItemUseCase);
          const parentResult = await getItem.execute(options.parent);
          if (!parentResult.ok) {
            messages.error(`Parent work item not found: "${options.parent}"`);
            process.exitCode = 1;
            return;
          }
          parentId = parentResult.workItem.id;
        }

        const useCase = container.resolve(CreateWorkItemUseCase);
        const result = await useCase.execute({
          projectId: project.id,
          title,
          priority,
          description: options.description,
          parentId,
        });

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        const wi = result.workItem;
        messages.newline();
        messages.success('Work item created');
        console.log(`  ${colors.muted('ID:')}       ${wi.identifierPrefix}-${wi.sequenceId}`);
        console.log(`  ${colors.muted('Title:')}    ${wi.title}`);
        console.log(`  ${colors.muted('Priority:')} ${wi.priority}`);
        if (options.parent) {
          console.log(`  ${colors.muted('Parent:')}   ${options.parent}`);
        }
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
        messages.error('Failed to create work item', err);
        process.exitCode = 1;
      }
    });
}
