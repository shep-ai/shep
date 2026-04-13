import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { DeclineIntakeItemUseCase } from '@/application/use-cases/intake/decline-intake-item.use-case.js';
import { input } from '@inquirer/prompts';
import { messages } from '../../ui/index.js';

export function createDeclineCommand(): Command {
  return new Command('decline')
    .description('Decline an intake item with a reason')
    .argument('<id>', 'Intake item ID')
    .option('-r, --reason <reason>', 'Reason for declining')
    .action(async (intakeItemId: string, opts: { reason?: string }) => {
      try {
        const reason =
          opts.reason ??
          (await input({
            message: 'Reason for declining:',
            validate: (v) => (v.trim() ? true : 'Reason is required'),
          }));

        const useCase = container.resolve(DeclineIntakeItemUseCase);
        const result = await useCase.execute({ intakeItemId, reason });

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        messages.success('Intake item declined.');
      } catch (error) {
        if (error instanceof Error && error.message.includes('force closed')) {
          messages.info('Cancelled');
          return;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to decline intake item', err);
        process.exitCode = 1;
      }
    });
}
