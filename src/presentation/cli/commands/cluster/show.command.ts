/**
 * Cluster Show Command
 *
 * Display details of a specific cluster.
 *
 * Usage:
 *   shep cluster show <id-or-slug>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
import { colors, messages, renderDetailView } from '../../ui/index.js';
import { resolveCluster } from './resolve-cluster.js';
import { getCliI18n } from '../../i18n.js';

function formatDate(date?: Date | string | null): string | null {
  if (!date) return null;
  try {
    return new Date(date).toLocaleString();
  } catch {
    return String(date);
  }
}

export function createShowCommand(): Command {
  const t = getCliI18n().t;
  return new Command('show')
    .description(t('cli:commands.cluster.show.description'))
    .argument('<id>', t('cli:commands.cluster.show.idArgument'))
    .action(async (id: string) => {
      try {
        const resolved = await resolveCluster(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const cluster = resolved.cluster;

        // Fetch linked entities
        const repo = container.resolve<IClusterRepository>('IClusterRepository');
        const linkedRepos = await repo.getLinkedRepositories(cluster.id);
        const linkedApps = await repo.getLinkedApplications(cluster.id);

        renderDetailView({
          title: t('cli:commands.cluster.show.title', { name: cluster.name }),
          sections: [
            {
              fields: [
                { label: 'ID', value: cluster.id },
                { label: t('cli:commands.cluster.show.nameLabel'), value: cluster.name },
                { label: t('cli:commands.cluster.show.slugLabel'), value: cluster.slug },
                { label: t('cli:commands.cluster.show.statusLabel'), value: cluster.status },
                {
                  label: t('cli:commands.cluster.show.descriptionLabel'),
                  value: cluster.description,
                },
              ],
            },
            {
              title: t('cli:commands.cluster.show.configTitle'),
              fields: [
                {
                  label: t('cli:commands.cluster.show.argocdLabel'),
                  value: cluster.argoCdEnabled ? 'enabled' : 'disabled',
                },
                {
                  label: t('cli:commands.cluster.show.argocdNamespaceLabel'),
                  value: cluster.argoCdNamespace,
                },
                {
                  label: t('cli:commands.cluster.show.kubeconfigLabel'),
                  value: cluster.kubeconfigPath ?? colors.muted('none'),
                },
                {
                  label: t('cli:commands.cluster.show.k3dNameLabel'),
                  value: cluster.k3dClusterName ?? colors.muted('none'),
                },
                {
                  label: t('cli:commands.cluster.show.nodeCountLabel'),
                  value: String(cluster.nodeCount),
                },
                {
                  label: t('cli:commands.cluster.show.errorLabel'),
                  value: cluster.errorMessage,
                },
              ],
            },
            {
              title: t('cli:commands.cluster.show.timestampsTitle'),
              fields: [
                {
                  label: t('cli:commands.cluster.show.createdLabel'),
                  value: formatDate(cluster.createdAt),
                },
                {
                  label: t('cli:commands.cluster.show.updatedLabel'),
                  value: formatDate(cluster.updatedAt),
                },
                {
                  label: t('cli:commands.cluster.show.provisionedLabel'),
                  value: formatDate(cluster.lastProvisionedAt),
                },
                {
                  label: t('cli:commands.cluster.show.healthCheckLabel'),
                  value: formatDate(cluster.lastHealthCheckAt),
                },
              ],
            },
            {
              title: t('cli:commands.cluster.show.linkedTitle'),
              fields: [
                {
                  label: t('cli:commands.cluster.show.reposLabel'),
                  value:
                    linkedRepos.length > 0
                      ? linkedRepos.map((r) => r.name).join(', ')
                      : colors.muted('none'),
                },
                {
                  label: t('cli:commands.cluster.show.appsLabel'),
                  value:
                    linkedApps.length > 0
                      ? linkedApps.map((a) => a.name).join(', ')
                      : colors.muted('none'),
                },
              ],
            },
          ],
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.cluster.show.failedToShow'), err);
        process.exitCode = 1;
      }
    });
}
