/**
 * Cluster List Command
 *
 * List all clusters in a formatted table.
 *
 * Usage:
 *   shep cluster ls
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListClustersUseCase } from '@/application/use-cases/clusters/list-clusters.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

function colorStatus(status: string): string {
  switch (status) {
    case 'Ready':
      return colors.success(status);
    case 'Provisioning':
      return colors.info(status);
    case 'Stopping':
    case 'Destroying':
      return colors.warning(status);
    case 'Stopped':
      return colors.muted(status);
    case 'Error':
      return colors.error(status);
    default:
      return colors.muted(status);
  }
}

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.cluster.ls.description'))
    .action(async () => {
      try {
        const useCase = container.resolve(ListClustersUseCase);
        const clusters = await useCase.execute();

        const rows = clusters.map((c) => [
          c.id.substring(0, 8),
          c.name,
          colorStatus(c.status),
          c.argoCdEnabled ? colors.success('on') : colors.muted('off'),
        ]);

        renderListView({
          title: t('cli:commands.cluster.ls.title'),
          columns: [
            { label: t('cli:commands.cluster.ls.idColumn'), width: 10 },
            { label: t('cli:commands.cluster.ls.nameColumn'), width: 24 },
            { label: t('cli:commands.cluster.ls.statusColumn'), width: 14 },
            { label: t('cli:commands.cluster.ls.argocdColumn'), width: 8 },
          ],
          rows,
          emptyMessage: t('cli:commands.cluster.ls.noClusters'),
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.cluster.ls.failedToList'), err);
        process.exitCode = 1;
      }
    });
}
