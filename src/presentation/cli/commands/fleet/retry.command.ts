/**
 * shep fleet retry
 *
 * Restarts the agents behind failures the triage feed already surfaced, in one
 * command: `shep fleet retry --ci` for the runs whose CI failed, `--failed` for
 * the runs that crashed.
 *
 * Scope is required, exactly as it is for `fleet approve`: a bare `shep fleet
 * retry` must never be able to restart the whole fleet by accident.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import {
  RetryFailedFleetFeaturesUseCase,
  type FleetRetryScope,
} from '@/application/use-cases/fleet/retry-failed-fleet-features.use-case.js';
import { colors, fmt, messages, symbols } from '../../ui/index.js';

export function createRetryCommand(): Command {
  return new Command('retry')
    .description('Restart the agents behind failed runs (CI failures or crashes)')
    .option('--ci', 'Retry only features whose CI checks failed')
    .option('--failed', 'Retry only features whose agent run crashed or failed')
    .option('--repo <path>', 'Restrict the batch to a specific repository path')
    .action(async (options: { ci?: boolean; failed?: boolean; repo?: string }) => {
      try {
        if (options.ci === options.failed) {
          messages.error('Specify exactly one of --ci or --failed to confirm the retry scope.');
          process.exitCode = 1;
          return;
        }

        const scope: FleetRetryScope = options.ci ? 'ci' : 'failed';
        const useCase = container.resolve(RetryFailedFleetFeaturesUseCase);
        const result = await useCase.execute({
          scope,
          ...(options.repo ? { repositoryPath: options.repo } : {}),
        });

        messages.newline();

        if (result.attemptedCount === 0) {
          messages.success(
            scope === 'ci'
              ? 'No features with failing CI — nothing to retry.'
              : 'No failed runs — nothing to retry.'
          );
          messages.newline();
          return;
        }

        messages.success(
          `Retried ${result.retriedFeatureIds.length} of ${result.attemptedCount} ${scope === 'ci' ? 'CI-failed' : 'failed'} features.`
        );

        for (const featureId of result.retriedFeatureIds) {
          console.log(`  ${colors.success(symbols.success)} ${fmt.bold(featureId)}`);
        }

        if (result.failures.length > 0) {
          messages.newline();
          console.log(
            `  ${colors.warning(symbols.warning)} ${result.failures.length} could not be restarted:`
          );
          for (const failure of result.failures) {
            console.log(`    ${fmt.bold(failure.featureName)}: ${colors.muted(failure.reason)}`);
          }
        }

        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to retry fleet features', err);
        process.exitCode = 1;
      }
    });
}
