/**
 * Cycle New Command
 *
 * Create a new cycle interactively or with options.
 *
 * Usage:
 *   shep cycle new <project>
 *   shep cycle new <project> --name "Sprint 1" --start 2025-01-01 --end 2025-01-14
 */

import { Command } from 'commander';
import { input } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { GetPmProjectUseCase } from '@/application/use-cases/pm-projects/get-pm-project.use-case.js';
import { CreateCycleUseCase } from '@/application/use-cases/cycles/create-cycle.use-case.js';
import { colors, messages } from '../../ui/index.js';

interface NewOptions {
  name?: string;
  description?: string;
  start?: string;
  end?: string;
}

function parseDate(value: string): Date | undefined {
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export function createNewCommand(): Command {
  return new Command('new')
    .description('Create a new cycle')
    .argument('<project>', 'Project slug or ID')
    .option('-n, --name <name>', 'Cycle name')
    .option('-d, --description <description>', 'Cycle description')
    .option('-s, --start <date>', 'Start date (YYYY-MM-DD)')
    .option('-e, --end <date>', 'End date (YYYY-MM-DD)')
    .action(async (projectSlug: string, options: NewOptions) => {
      try {
        const getProject = container.resolve(GetPmProjectUseCase);
        const projectResult = await getProject.execute(projectSlug);

        if (!projectResult.ok) {
          messages.error(projectResult.error);
          process.exitCode = 1;
          return;
        }

        const name =
          options.name ??
          (await input({
            message: 'Cycle name:',
            validate: (v) => (v.trim().length > 0 ? true : 'Name is required'),
          }));

        const useCase = container.resolve(CreateCycleUseCase);
        const result = await useCase.execute({
          projectId: projectResult.project.id,
          name,
          description: options.description,
          startDate: options.start ? parseDate(options.start) : undefined,
          endDate: options.end ? parseDate(options.end) : undefined,
        });

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        messages.newline();
        messages.success('Cycle created');
        console.log(`  ${colors.muted('Name:')}   ${result.cycle.name}`);
        console.log(`  ${colors.muted('Status:')} ${result.cycle.status}`);
        console.log(`  ${colors.muted('ID:')}     ${result.cycle.id}`);
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
        messages.error('Failed to create cycle', err);
        process.exitCode = 1;
      }
    });
}
