/**
 * Cluster Link Command
 *
 * Links a repository or application to a cluster. Auto-detects
 * the entity type by trying repository first, then application.
 *
 * Usage:
 *   shep cluster link <cluster-id-or-slug> <entity-id>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { LinkRepositoryUseCase } from '@/application/use-cases/clusters/link-repository.use-case.js';
import { LinkApplicationUseCase } from '@/application/use-cases/clusters/link-application.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { resolveCluster } from './resolve-cluster.js';
import { getCliI18n } from '../../i18n.js';

export function createLinkCommand(): Command {
  const t = getCliI18n().t;
  return new Command('link')
    .description(t('cli:commands.cluster.link.description'))
    .argument('<cluster>', t('cli:commands.cluster.link.clusterArgument'))
    .argument('<entity>', t('cli:commands.cluster.link.entityArgument'))
    .action(async (clusterId: string, entityId: string) => {
      try {
        const resolved = await resolveCluster(clusterId);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const cluster = resolved.cluster;

        // Try linking as repository first
        const linkRepoUseCase = container.resolve(LinkRepositoryUseCase);
        const repoResult = await linkRepoUseCase.execute({
          clusterId: cluster.id,
          entityId,
        });

        if (repoResult.ok) {
          messages.newline();
          messages.success(t('cli:commands.cluster.link.linked'));
          console.log(
            `  ${colors.muted(t('cli:commands.cluster.link.clusterLabel'))} ${cluster.name}`
          );
          console.log(`  ${colors.muted(t('cli:commands.cluster.link.entityLabel'))} ${entityId}`);
          messages.newline();
          return;
        }

        // If repo not found, try linking as application
        if (repoResult.error.includes('Repository not found')) {
          const linkAppUseCase = container.resolve(LinkApplicationUseCase);
          const appResult = await linkAppUseCase.execute({
            clusterId: cluster.id,
            entityId,
          });

          if (appResult.ok) {
            messages.newline();
            messages.success(t('cli:commands.cluster.link.linked'));
            console.log(
              `  ${colors.muted(t('cli:commands.cluster.link.clusterLabel'))} ${cluster.name}`
            );
            console.log(
              `  ${colors.muted(t('cli:commands.cluster.link.entityLabel'))} ${entityId}`
            );
            messages.newline();
            return;
          }

          messages.error(appResult.error);
          process.exitCode = 1;
          return;
        }

        messages.error(repoResult.error);
        process.exitCode = 1;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.cluster.link.failedToLink'), err);
        process.exitCode = 1;
      }
    });
}
