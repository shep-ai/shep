/**
 * Repo List Command
 *
 * List all tracked repositories in a formatted table.
 *
 * Usage:
 *   shep repo ls
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListRepositoriesUseCase } from '@/application/use-cases/repositories/list-repositories.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
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

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.repo.ls.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep repo ls`
    )
    .action(async () => {
      try {
        const useCase = container.resolve(ListRepositoriesUseCase);
        const featureRepo = container.resolve<IFeatureRepository>('IFeatureRepository');
        const repositories = await useCase.execute();

        const now = Date.now();
        const rows = await Promise.all(
          repositories.map(async (repo) => {
            const features = await featureRepo.list({ repositoryPath: repo.path });
            return [
              repo.id.substring(0, 8),
              repo.name,
              String(features.length),
              repo.path,
              colors.muted(`${formatDuration(now - new Date(repo.createdAt).getTime())} ago`),
            ];
          })
        );

        renderListView({
          title: t('cli:commands.repo.ls.title'),
          columns: [
            { label: t('cli:commands.repo.ls.idColumn'), width: 10 },
            { label: t('cli:commands.repo.ls.nameColumn'), width: 28 },
            { label: t('cli:commands.repo.ls.featuresColumn'), width: 10 },
            { label: t('cli:commands.repo.ls.pathColumn'), width: 36 },
            { label: t('cli:commands.repo.ls.createdColumn'), width: 12 },
          ],
          rows,
          emptyMessage: t('cli:commands.repo.ls.noRepos'),
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.repo.ls.failedToList'), err);
        process.exitCode = 1;
      }
    });
}
