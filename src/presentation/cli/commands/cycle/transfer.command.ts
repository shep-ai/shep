/**
 * Cycle Transfer Command
 *
 * Transfer incomplete work items from one cycle to another.
 * Completed and cancelled items remain in the source cycle.
 *
 * Usage:
 *   shep cycle transfer <source-cycle-id> [target-cycle-id]
 */

import { Command } from 'commander';
import { confirm } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { TransferCycleItemsUseCase } from '@/application/use-cases/cycles/transfer-cycle-items.use-case.js';
import { GetCycleUseCase } from '@/application/use-cases/cycles/get-cycle.use-case.js';
import { colors, messages } from '../../ui/index.js';

interface TransferOptions {
  force?: boolean;
}

export function createTransferCommand(): Command {
  return new Command('transfer')
    .description('Transfer incomplete items from one cycle to another')
    .argument('<source>', 'Source cycle ID')
    .argument('[target]', 'Target cycle ID (omit to remove items from cycle)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (source: string, target: string | undefined, options: TransferOptions) => {
      try {
        const getCycle = container.resolve(GetCycleUseCase);
        const sourceResult = await getCycle.execute(source);

        if (!sourceResult.ok) {
          messages.error(sourceResult.error);
          process.exitCode = 1;
          return;
        }

        const action = target
          ? `Transfer incomplete items from "${sourceResult.cycle.name}" to another cycle?`
          : `Remove incomplete items from "${sourceResult.cycle.name}"?`;

        if (!options.force) {
          const confirmed = await confirm({ message: action, default: false });
          if (!confirmed) {
            messages.info('Cancelled');
            return;
          }
        }

        const useCase = container.resolve(TransferCycleItemsUseCase);
        const result = await useCase.execute({
          sourceCycleId: source,
          targetCycleId: target,
        });

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        messages.newline();
        messages.success('Transfer complete');
        console.log(`  ${colors.muted('Transferred:')} ${result.transferred} item(s)`);
        console.log(`  ${colors.muted('Kept:')}        ${result.kept} completed item(s)`);
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
        messages.error('Failed to transfer cycle items', err);
        process.exitCode = 1;
      }
    });
}
