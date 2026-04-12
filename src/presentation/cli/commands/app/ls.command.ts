/**
 * Application List Command
 *
 * List all applications in a formatted table.
 *
 * Usage:
 *   shep app ls
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListApplicationsUseCase } from '@/application/use-cases/applications/list-applications.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

/** Format a duration in ms to a compact human-readable string. */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function colorStatus(status: string): string {
  switch (status) {
    case 'Idle':
      return colors.muted(status);
    case 'Active':
      return colors.success(status);
    case 'Error':
      return colors.warning(status);
    default:
      return colors.muted(status);
  }
}

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls').description(t('cli:commands.app.ls.description')).action(async () => {
    try {
      const useCase = container.resolve(ListApplicationsUseCase);
      const applications = await useCase.execute();

      const now = Date.now();
      const rows = applications.map((app) => [
        app.id.substring(0, 8),
        app.name,
        colorStatus(app.status),
        app.repositoryPath,
        colors.muted(`${formatDuration(now - new Date(app.createdAt).getTime())} ago`),
      ]);

      renderListView({
        title: t('cli:commands.app.ls.title'),
        columns: [
          { label: t('cli:commands.app.ls.idColumn'), width: 10 },
          { label: t('cli:commands.app.ls.nameColumn'), width: 28 },
          { label: t('cli:commands.app.ls.statusColumn'), width: 10 },
          { label: t('cli:commands.app.ls.pathColumn'), width: 36 },
          { label: t('cli:commands.app.ls.createdColumn'), width: 12 },
        ],
        rows,
        emptyMessage: t('cli:commands.app.ls.noApps'),
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      messages.error(t('cli:commands.app.ls.failedToList'), err);
      process.exitCode = 1;
    }
  });
}
