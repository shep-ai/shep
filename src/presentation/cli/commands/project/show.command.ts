/**
 * Project Show Command
 *
 * Display details of a specific project including its work items.
 *
 * Usage:
 *   shep project show <slug>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetPmProjectUseCase } from '@/application/use-cases/pm-projects/get-pm-project.use-case.js';
import { ListWorkItemsUseCase } from '@/application/use-cases/work-items/list-work-items.use-case.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import { colors, messages, renderDetailView, renderListView } from '../../ui/index.js';

function formatDate(date?: Date | string | null): string | null {
  if (!date) return null;
  try {
    return new Date(date).toLocaleString();
  } catch {
    return String(date);
  }
}

export function createShowCommand(): Command {
  return new Command('show')
    .description('Show project details')
    .argument('<slug>', 'Project slug or ID')
    .action(async (slug: string) => {
      try {
        const getProject = container.resolve(GetPmProjectUseCase);
        const result = await getProject.execute(slug);

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        const project = result.project;

        renderDetailView({
          title: `Project: ${project.name}`,
          sections: [
            {
              fields: [
                { label: 'Name', value: project.name },
                { label: 'Prefix', value: project.identifierPrefix },
                { label: 'Slug', value: project.slug },
                { label: 'Description', value: project.description ?? colors.muted('—') },
                { label: 'Items', value: String(project.workItemCounter) },
              ],
            },
            {
              title: 'Timestamps',
              fields: [
                { label: 'Created', value: formatDate(project.createdAt) },
                { label: 'Updated', value: formatDate(project.updatedAt) },
              ],
            },
          ],
        });

        // Show work items if any exist
        if (project.workItemCounter > 0) {
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

          messages.newline();
          renderListView({
            title: `Work Items (${workItems.length})`,
            columns: [
              { label: 'ID', width: 10 },
              { label: 'Title', width: 36 },
              { label: 'State', width: 14 },
              { label: 'Priority', width: 10 },
            ],
            rows,
            emptyMessage: 'No work items',
          });
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to show project', err);
        process.exitCode = 1;
      }
    });
}
