/**
 * Project List Command
 *
 * List all PM projects in a formatted table.
 *
 * Usage:
 *   shep project ls
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListPmProjectsUseCase } from '@/application/use-cases/pm-projects/list-pm-projects.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';

export function createLsCommand(): Command {
  return new Command('ls').description('List all projects').action(async () => {
    try {
      const useCase = container.resolve(ListPmProjectsUseCase);
      const projects = await useCase.execute();

      const rows = projects.map((p) => [
        p.identifierPrefix,
        p.name,
        String(p.workItemCounter),
        p.description ?? colors.muted('—'),
      ]);

      renderListView({
        title: 'Projects',
        columns: [
          { label: 'Prefix', width: 8 },
          { label: 'Name', width: 28 },
          { label: 'Items', width: 8 },
          { label: 'Description', width: 40 },
        ],
        rows,
        emptyMessage: 'No projects found. Create one with: shep project new',
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      messages.error('Failed to list projects', err);
      process.exitCode = 1;
    }
  });
}
