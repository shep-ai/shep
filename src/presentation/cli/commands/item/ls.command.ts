/**
 * Item List Command
 *
 * List work items in a project.
 *
 * Usage:
 *   shep item ls <project>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetPmProjectUseCase } from '@/application/use-cases/pm-projects/get-pm-project.use-case.js';
import { ListWorkItemsUseCase } from '@/application/use-cases/work-items/list-work-items.use-case.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import { colors, messages, renderListView } from '../../ui/index.js';

export function createLsCommand(): Command {
  return new Command('ls')
    .description('List work items in a project')
    .argument('<project>', 'Project slug or identifier prefix')
    .action(async (projectSlug: string) => {
      try {
        const getProject = container.resolve(GetPmProjectUseCase);
        const result = await getProject.execute(projectSlug);

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        const project = result.project;

        const listItems = container.resolve(ListWorkItemsUseCase);
        const stateRepo = container.resolve<IWorkItemStateRepository>('IWorkItemStateRepository');
        const workItems = await listItems.execute(project.id);
        const states = await stateRepo.listByProject(project.id);
        const stateMap = new Map(states.map((s) => [s.id, s]));

        const rows = workItems.map((wi) => {
          const state = stateMap.get(wi.stateId);
          return [
            colors.muted(`${wi.identifierPrefix}-${wi.sequenceId}`),
            wi.title,
            state?.name ?? colors.muted('—'),
            wi.priority ?? colors.muted('—'),
          ];
        });

        renderListView({
          title: `${project.name} — Work Items`,
          columns: [
            { label: 'ID', width: 10 },
            { label: 'Title', width: 36 },
            { label: 'State', width: 14 },
            { label: 'Priority', width: 10 },
          ],
          rows,
          emptyMessage: `No work items in ${project.name}. Create one with: shep item new ${projectSlug}`,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list work items', err);
        process.exitCode = 1;
      }
    });
}
