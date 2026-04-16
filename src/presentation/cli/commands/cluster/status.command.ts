/**
 * Cluster Status Command
 *
 * Shows live cluster status including pod count, services,
 * and ArgoCD sync state if enabled.
 *
 * Usage:
 *   shep cluster status <id-or-slug>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetClusterStatusUseCase } from '@/application/use-cases/clusters/get-cluster-status.use-case.js';
import { colors, messages, renderDetailView, renderListView } from '../../ui/index.js';
import { resolveCluster } from './resolve-cluster.js';
import { getCliI18n } from '../../i18n.js';

export function createStatusCommand(): Command {
  const t = getCliI18n().t;
  return new Command('status')
    .description(t('cli:commands.cluster.status.description'))
    .argument('<id>', t('cli:commands.cluster.status.idArgument'))
    .action(async (id: string) => {
      try {
        const resolved = await resolveCluster(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const cluster = resolved.cluster;

        const statusUseCase = container.resolve(GetClusterStatusUseCase);
        const result = await statusUseCase.execute(cluster.id);

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        const { status } = result;

        renderDetailView({
          title: t('cli:commands.cluster.status.title', { name: cluster.name }),
          sections: [
            {
              fields: [
                {
                  label: t('cli:commands.cluster.status.statusLabel'),
                  value: status.cluster.status,
                },
                {
                  label: t('cli:commands.cluster.status.podCountLabel'),
                  value: status.live ? String(status.live.podCount) : colors.muted('n/a'),
                },
                {
                  label: t('cli:commands.cluster.status.serviceCountLabel'),
                  value: status.live ? String(status.live.serviceCount) : colors.muted('n/a'),
                },
                {
                  label: t('cli:commands.cluster.status.argocdLabel'),
                  value: status.cluster.argoCdEnabled
                    ? status.live?.argocd
                      ? colors.success('running')
                      : colors.muted('n/a')
                    : colors.muted('disabled'),
                },
              ],
            },
          ],
        });

        // Show pods table if available
        if (status.live && status.live.pods.length > 0) {
          renderListView({
            title: t('cli:commands.cluster.status.podsTitle'),
            columns: [
              { label: 'Name', width: 40 },
              { label: 'Namespace', width: 14 },
              { label: 'Status', width: 12 },
              { label: 'Ready', width: 6 },
            ],
            rows: status.live.pods.map((pod) => [
              pod.name,
              pod.namespace,
              pod.status === 'Running' ? colors.success(pod.status) : colors.warning(pod.status),
              pod.ready ? colors.success('yes') : colors.warning('no'),
            ]),
          });
        }

        // Show services table if available
        if (status.live && status.live.services.length > 0) {
          renderListView({
            title: t('cli:commands.cluster.status.servicesTitle'),
            columns: [
              { label: 'Name', width: 30 },
              { label: 'Type', width: 14 },
              { label: 'Ports', width: 20 },
            ],
            rows: status.live.services.map((svc) => [svc.name, svc.type, svc.ports]),
          });
        }

        if (status.error) {
          messages.warning(status.error);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.cluster.status.failedToGetStatus'), err);
        process.exitCode = 1;
      }
    });
}
