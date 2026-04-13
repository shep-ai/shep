/**
 * Cycle List Command
 *
 * List all cycles for a project in a formatted table.
 *
 * Usage:
 *   shep cycle ls <project>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetPmProjectUseCase } from '@/application/use-cases/pm-projects/get-pm-project.use-case.js';
import { ListCyclesUseCase } from '@/application/use-cases/cycles/list-cycles.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';

function formatDateShort(date?: Date | string | null): string {
  if (!date) return colors.muted('—');
  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return String(date);
  }
}

export function createLsCommand(): Command {
  return new Command('ls')
    .description('List cycles in a project')
    .argument('<project>', 'Project slug or ID')
    .action(async (projectSlug: string) => {
      try {
        const getProject = container.resolve(GetPmProjectUseCase);
        const projectResult = await getProject.execute(projectSlug);

        if (!projectResult.ok) {
          messages.error(projectResult.error);
          process.exitCode = 1;
          return;
        }

        const useCase = container.resolve(ListCyclesUseCase);
        const cycles = await useCase.execute(projectResult.project.id);

        const rows = cycles.map((c) => [
          c.id.slice(0, 8),
          c.name,
          c.status,
          formatDateShort(c.startDate),
          formatDateShort(c.endDate),
        ]);

        renderListView({
          title: `Cycles — ${projectResult.project.name}`,
          columns: [
            { label: 'ID', width: 10 },
            { label: 'Name', width: 24 },
            { label: 'Status', width: 12 },
            { label: 'Start', width: 12 },
            { label: 'End', width: 12 },
          ],
          rows,
          emptyMessage: 'No cycles found. Create one with: shep cycle new <project>',
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list cycles', err);
        process.exitCode = 1;
      }
    });
}
