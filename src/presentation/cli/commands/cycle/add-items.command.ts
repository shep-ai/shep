/**
 * Cycle Add Items Command
 *
 * Add work items to a cycle by their IDs.
 *
 * Usage:
 *   shep cycle add-items <cycle-id> <item-ids...>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { AddItemsToCycleUseCase } from '@/application/use-cases/cycles/add-items-to-cycle.use-case.js';
import { messages } from '../../ui/index.js';

export function createAddItemsCommand(): Command {
  return new Command('add-items')
    .description('Add work items to a cycle')
    .argument('<cycle-id>', 'Cycle ID')
    .argument('<item-ids...>', 'Work item IDs to add')
    .action(async (cycleId: string, itemIds: string[]) => {
      try {
        const useCase = container.resolve(AddItemsToCycleUseCase);
        const result = await useCase.execute(cycleId, itemIds);

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        messages.newline();
        messages.success(`Added ${result.added} item(s) to cycle`);
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to add items to cycle', err);
        process.exitCode = 1;
      }
    });
}
