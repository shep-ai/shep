/**
 * `shep app cloud-providers ls`
 *
 * Thin wrapper around ListCloudProvidersUseCase.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListCloudProvidersUseCase } from '@/application/use-cases/cloud-deploy/list-cloud-providers.use-case.js';
import { messages, colors } from '../../../ui/index.js';

export function createCloudProvidersLsCommand(): Command {
  return new Command('ls')
    .description('List cloud deployment providers and their connection state')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const useCase = container.resolve(ListCloudProvidersUseCase);
        const providers = await useCase.execute();

        if (options.json) {
          process.stdout.write(`${JSON.stringify(providers, null, 2)}\n`);
          return;
        }

        process.stdout.write('\nCloud deployment providers:\n\n');
        for (const provider of providers) {
          const status = !provider.enabled
            ? colors.muted('coming soon')
            : provider.connected
              ? colors.success('connected')
              : colors.warning('not connected');
          const marker = provider.enabled ? '●' : '○';
          process.stdout.write(`  ${marker} ${provider.displayName.padEnd(20)} ${status}\n`);
        }
        process.stdout.write('\n');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list cloud providers', err);
        process.exitCode = 1;
      }
    });
}
