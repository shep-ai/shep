/**
 * Cluster Unlink Command
 *
 * Unlinks a repository or application from a cluster. Tries
 * repository first, then application.
 *
 * Usage:
 *   shep cluster unlink <cluster-id-or-slug> <entity-id>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { UnlinkRepositoryUseCase } from '@/application/use-cases/clusters/unlink-repository.use-case.js';
import { UnlinkApplicationUseCase } from '@/application/use-cases/clusters/unlink-application.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { resolveCluster } from './resolve-cluster.js';
import { getCliI18n } from '../../i18n.js';

export function createUnlinkCommand(): Command {
  const t = getCliI18n().t;
  return new Command('unlink')
    .description(t('cli:commands.cluster.unlink.description'))
    .argument('<cluster>', t('cli:commands.cluster.unlink.clusterArgument'))
    .argument('<entity>', t('cli:commands.cluster.unlink.entityArgument'))
    .action(async (clusterId: string, entityId: string) => {
      try {
        const resolved = await resolveCluster(clusterId);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const cluster = resolved.cluster;

        // Try unlinking as repository first, then application
        const unlinkRepoUseCase = container.resolve(UnlinkRepositoryUseCase);
        await unlinkRepoUseCase.execute({ clusterId: cluster.id, entityId });

        const unlinkAppUseCase = container.resolve(UnlinkApplicationUseCase);
        await unlinkAppUseCase.execute({ clusterId: cluster.id, entityId });

        messages.newline();
        messages.success(t('cli:commands.cluster.unlink.unlinked'));
        console.log(
          `  ${colors.muted(t('cli:commands.cluster.unlink.clusterLabel'))} ${cluster.name}`
        );
        console.log(`  ${colors.muted(t('cli:commands.cluster.unlink.entityLabel'))} ${entityId}`);
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.cluster.unlink.failedToUnlink'), err);
        process.exitCode = 1;
      }
    });
}
