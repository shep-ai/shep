/**
 * Cycle Show Command
 *
 * Display details of a specific cycle including its work items.
 *
 * Usage:
 *   shep cycle show <cycle-id>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetCycleUseCase } from '@/application/use-cases/cycles/get-cycle.use-case.js';
import type { ICycleRepository } from '@/application/ports/output/repositories/cycle-repository.interface.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
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
    .description('Show cycle details')
    .argument('<cycle-id>', 'Cycle ID')
    .action(async (cycleId: string) => {
      try {
        const getCycle = container.resolve(GetCycleUseCase);
        const result = await getCycle.execute(cycleId);

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        const cycle = result.cycle;

        renderDetailView({
          title: `Cycle: ${cycle.name}`,
          sections: [
            {
              fields: [
                { label: 'Name', value: cycle.name },
                { label: 'Status', value: cycle.status },
                { label: 'Description', value: cycle.description ?? colors.muted('—') },
                { label: 'Start Date', value: formatDate(cycle.startDate) ?? colors.muted('—') },
                { label: 'End Date', value: formatDate(cycle.endDate) ?? colors.muted('—') },
              ],
            },
            {
              title: 'Timestamps',
              fields: [
                { label: 'Created', value: formatDate(cycle.createdAt) },
                { label: 'Updated', value: formatDate(cycle.updatedAt) },
              ],
            },
          ],
        });

        // Show work items assigned to this cycle
        const cycleRepo = container.resolve<ICycleRepository>('ICycleRepository');
        const workItemIds = await cycleRepo.getWorkItemIds(cycleId);

        if (workItemIds.length > 0) {
          const workItemRepo = container.resolve<IWorkItemRepository>('IWorkItemRepository');
          const stateRepo = container.resolve<IWorkItemStateRepository>('IWorkItemStateRepository');

          const workItems = await Promise.all(workItemIds.map((id) => workItemRepo.findById(id)));
          const validItems = workItems.filter((w) => w !== null);

          if (validItems.length > 0) {
            const states = await stateRepo.listByProject(cycle.projectId);
            const stateMap = new Map(states.map((s) => [s.id, s]));

            const rows = validItems.map((wi) => {
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
              title: `Work Items (${validItems.length})`,
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
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to show cycle', err);
        process.exitCode = 1;
      }
    });
}
