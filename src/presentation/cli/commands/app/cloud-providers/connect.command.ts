/**
 * `shep app cloud-providers connect <provider>`
 *
 * Thin wrapper around ConnectCloudProviderUseCase. Prompts for a token
 * unless --token is passed. Validates the token via the live provider
 * adapter before persisting.
 */

import { Command } from 'commander';
import { password } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { ConnectCloudProviderUseCase } from '@/application/use-cases/cloud-deploy/connect-cloud-provider.use-case.js';
import { parseCloudDeploymentProvider } from '@/domain/shared/cloud-deployment-provider.js';
import { messages, colors } from '../../../ui/index.js';

export function createCloudProvidersConnectCommand(): Command {
  return new Command('connect')
    .description('Connect a cloud deployment provider with an API token')
    .argument('<provider>', 'Provider id (e.g. CloudflarePages)')
    .option('--token <token>', 'API token (if omitted, prompts securely)')
    .action(async (providerArg: string, options: { token?: string }) => {
      try {
        const provider = parseCloudDeploymentProvider(providerArg, { ignoreCase: true });
        if (!provider) {
          messages.error(
            `Unknown provider: ${providerArg}. Run \`shep app cloud-providers ls\` to see the list.`
          );
          process.exitCode = 1;
          return;
        }

        const token =
          options.token ??
          (await password({
            message: `Paste the ${provider} API token:`,
            mask: '*',
          }));

        if (!token || token.trim().length === 0) {
          messages.error('No token provided');
          process.exitCode = 1;
          return;
        }

        const useCase = container.resolve(ConnectCloudProviderUseCase);
        await useCase.execute({ provider, token: token.trim() });
        process.stdout.write(colors.success(`✓ ${provider} connected\n`));
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to connect provider', err);
        process.exitCode = 1;
      }
    });
}
