/**
 * Cluster Delete Command
 *
 * Soft-deletes a cluster. Destroys it first if running.
 *
 * Usage: shep cluster del <id-or-slug> [--force]
 *
 * @example
 * $ shep cluster del staging
 * $ shep cluster del a1b2c3d4 --force
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { DeleteClusterUseCase } from '@/application/use-cases/clusters/delete-cluster.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { confirm } from '@inquirer/prompts';
import { resolveCluster } from './resolve-cluster.js';
import { getCliI18n } from '../../i18n.js';

interface DelOptions {
  force?: boolean;
}

export function createDelCommand(): Command {
  const t = getCliI18n().t;
  return new Command('del')
    .description(t('cli:commands.cluster.del.description'))
    .argument('<id>', t('cli:commands.cluster.del.idArgument'))
    .option('-f, --force', t('cli:commands.cluster.del.forceOption'))
    .action(async (id: string, options: DelOptions) => {
      try {
        const resolved = await resolveCluster(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const cluster = resolved.cluster;

        if (!options.force) {
          const confirmed = await confirm({
            message: t('cli:commands.cluster.del.confirmDelete', { name: cluster.name }),
            default: false,
          });
          if (!confirmed) {
            messages.info(t('cli:commands.cluster.del.cancelled'));
            return;
          }
        }

        const deleteUseCase = container.resolve(DeleteClusterUseCase);
        const result = await deleteUseCase.execute(cluster.id);

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        messages.newline();
        messages.success(t('cli:commands.cluster.del.clusterDeleted'));
        console.log(`  ${colors.muted(t('cli:commands.cluster.del.nameLabel'))} ${cluster.name}`);
        console.log(`  ${colors.muted(t('cli:commands.cluster.del.slugLabel'))} ${cluster.slug}`);
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.cluster.del.failedToDelete'), err);
        process.exitCode = 1;
      }
    });
}
