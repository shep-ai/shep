/**
 * shep fleet approve
 *
 * Executes batch approvals for features waiting on lifecycle gates.
 *
 * `--low-risk` narrows the batch to the gates the configured guardrails prove
 * safe. It is a filter, not a mode: with no rules configured it approves
 * nothing and says why, rather than behaving like `--all`.
 *
 * The exit code is part of the contract: 1 whenever a selected gate was not
 * approved — failed, or deliberately left for a human — so `approve && …` does
 * not read a partial batch as a cleared fleet.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { BatchApproveFeaturesUseCase } from '@/application/use-cases/fleet/batch-approve-features.use-case.js';
import { type GuardrailGateType } from '@/domain/generated/output.js';
import { colors, fmt, messages, symbols } from '../../ui/index.js';

interface ApproveOptions {
  all?: boolean;
  gate?: string;
  lowRisk?: boolean;
}

export function createApproveCommand(): Command {
  return new Command('approve')
    .description('Batch-approve features waiting on approval gates')
    .option('--all', 'Approve all features currently waiting at approval gates')
    .option('--gate <type>', 'Filter approval to a specific gate: prd, plan, or merge')
    .option(
      '--low-risk',
      'Approve only the gates the configured guardrail rules prove safe (no rules = no approvals)'
    )
    .addHelpText(
      'after',
      `
Examples:
  $ shep fleet approve --gate plan     Approve every feature waiting on plan review
  $ shep fleet approve --low-risk      Approve only what the guardrails prove safe
  $ shep fleet approve --all           Approve every waiting gate`
    )
    .action(async (options: ApproveOptions) => {
      try {
        if (!options.all && !options.gate && !options.lowRisk) {
          messages.error(
            'Specify --all, --gate <type> or --low-risk to confirm batch approval scope.'
          );
          process.exitCode = 1;
          return;
        }

        const useCase = container.resolve(BatchApproveFeaturesUseCase);
        const result = await useCase.execute({
          gateType: options.gate as GuardrailGateType | undefined,
          lowRisk: options.lowRisk,
        });

        messages.newline();
        const summary = `Batch approved ${result.approvedCount} of ${result.totalAttempted} candidate features.`;
        if (result.approvedCount > 0) {
          messages.success(summary);
        } else {
          // Nothing approved is not a success tick — say it plainly.
          messages.warning(summary);
        }

        if (result.skippedCount > 0) {
          messages.newline();
          console.log(
            `  ${colors.warning(symbols.warning)} ${result.skippedCount} features were left for a human:`
          );
          // Group by reason: a batch that skipped five features for the same
          // reason must print that reason once (`LESSONS.md`).
          const byReason = new Map<string, string[]>();
          for (const skip of result.skipped) {
            const ids = byReason.get(skip.reason) ?? [];
            ids.push(skip.featureId);
            byReason.set(skip.reason, ids);
          }
          for (const [reason, ids] of byReason) {
            console.log(`    ${reason}: ${ids.join(', ')}`);
          }
        }

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

        // Exit 1 when anything selected was not approved, so a script never
        // treats a partial batch as a cleared fleet.
        if (result.approvedCount < result.totalAttempted) {
          process.exitCode = 1;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to execute batch approval', err);
        process.exitCode = 1;
      }
    });
}
