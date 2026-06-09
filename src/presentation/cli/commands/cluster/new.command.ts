/**
 * Cluster New Command
 *
 * Creates a new cluster entity. Optionally enables ArgoCD and
 * starts provisioning immediately.
 *
 * Usage:
 *   shep cluster new <name> [options]
 *
 * @example
 * $ shep cluster new "staging"
 * $ shep cluster new "production" --argocd
 * $ shep cluster new "dev" --provision
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { CreateClusterUseCase } from '@/application/use-cases/clusters/create-cluster.use-case.js';
import { ProvisionClusterUseCase } from '@/application/use-cases/clusters/provision-cluster.use-case.js';
import { colors, messages, spinner } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

interface NewOptions {
  argocd?: boolean;
  provision?: boolean;
}

export function createNewCommand(): Command {
  const t = getCliI18n().t;
  return new Command('new')
    .description(t('cli:commands.cluster.new.description'))
    .argument('<name>', t('cli:commands.cluster.new.nameArgument'))
    .option('--argocd', t('cli:commands.cluster.new.argocdOption'))
    .option('--provision', t('cli:commands.cluster.new.provisionOption'))
    .action(async (name: string, options: NewOptions) => {
      try {
        const createUseCase = container.resolve(CreateClusterUseCase);
        const result = await spinner(t('cli:commands.cluster.new.spinnerText'), () =>
          createUseCase.execute({
            name,
            argoCdEnabled: options.argocd,
          })
        );

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        const { cluster } = result;

        messages.newline();
        messages.success(t('cli:commands.cluster.new.clusterCreated'));
        console.log(
          `  ${colors.muted(t('cli:commands.cluster.new.idLabel'))}       ${colors.accent(cluster.id)}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.cluster.new.nameLabel'))}     ${cluster.name}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.cluster.new.slugLabel'))}     ${cluster.slug}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.cluster.new.statusLabel'))}   ${cluster.status}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.cluster.new.argocdLabel'))}   ${cluster.argoCdEnabled ? 'enabled' : 'disabled'}`
        );
        messages.newline();

        // Optionally start provisioning immediately
        if (options.provision) {
          const provisionUseCase = container.resolve(ProvisionClusterUseCase);
          const provisionResult = await provisionUseCase.execute(cluster.id);
          if (provisionResult.ok) {
            messages.success(t('cli:commands.cluster.new.provisioningStarted'));
          } else {
            messages.error(provisionResult.error);
            process.exitCode = 1;
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.cluster.new.failedToCreate'), err);
        process.exitCode = 1;
      }
    });
}
