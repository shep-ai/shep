/**
 * shep fleet approve
 *
 * Executes batch approvals for features waiting on lifecycle gates.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { BatchApproveFeaturesUseCase } from '@/application/use-cases/fleet/batch-approve-features.use-case.js';
import { type GuardrailGateType } from '@/domain/generated/output.js';
import { colors, fmt, messages, symbols } from '../../ui/index.js';

export function createApproveCommand(): Command {
  return new Command('approve')
    .description('Batch-approve features waiting on approval gates')
    .option('--all', 'Approve all features currently waiting at approval gates')
    .option('--gate <type>', 'Filter approval to a specific gate: prd, plan, or merge')
    .action(async (options: { all?: boolean; gate?: string }) => {
      try {
        if (!options.all && !options.gate) {
          messages.error('Specify --all or --gate <type> to confirm batch approval scope.');
          process.exitCode = 1;
          return;
        }

        const useCase = container.resolve(BatchApproveFeaturesUseCase);
        const result = await useCase.execute({
          gateType: options.gate as GuardrailGateType | undefined,
        });

        messages.newline();
        messages.success(
          `Batch approved ${result.approvedCount} of ${result.totalAttempted} candidate features.`
        );

        if (result.failedCount > 0) {
          messages.newline();
          console.log(
            `  ${colors.error(symbols.error)} ${result.failedCount} features could not be approved:`
          );
          for (const failure of result.failures) {
            console.log(`    - ${fmt.bold(failure.featureId)}: ${failure.reason}`);
          }
        }
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to execute batch approval', err);
        process.exitCode = 1;
      }
    });
}
