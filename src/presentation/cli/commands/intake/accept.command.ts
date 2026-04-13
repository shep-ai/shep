import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { AcceptIntakeItemUseCase } from '@/application/use-cases/intake/accept-intake-item.use-case.js';
import { messages } from '../../ui/index.js';

export function createAcceptCommand(): Command {
  return new Command('accept')
    .description('Accept an intake item and convert it to a work item')
    .argument('<id>', 'Intake item ID')
    .action(async (intakeItemId: string) => {
      try {
        const useCase = container.resolve(AcceptIntakeItemUseCase);
        const result = await useCase.execute({ intakeItemId });

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        messages.success(
          `Accepted — created work item ${result.workItem.identifierPrefix}-${result.workItem.sequenceId}: ${result.workItem.title}`
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to accept intake item', err);
        process.exitCode = 1;
      }
    });
}
