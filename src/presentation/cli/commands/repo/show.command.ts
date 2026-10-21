/**
 * Repo Show Command
 *
 * Display details of a specific tracked repository.
 *
 * Usage:
 *   shep repo show <id>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { colors, messages, renderDetailView } from '../../ui/index.js';
import { resolveRepository } from './resolve-repository.js';
import { getCliI18n } from '../../i18n.js';

/** Color a lifecycle value to match feat ls status styling. */
function colorLifecycle(lifecycle: string): string {
  switch (lifecycle) {
    case 'Started':
      return colors.muted(lifecycle);
    case 'Analyze':
    case 'Requirements':
    case 'Research':
    case 'Planning':
      return colors.info(lifecycle);
    case 'Implementation':
      return colors.warning(lifecycle);
    case 'Review':
      return colors.brand(lifecycle);
    case 'Maintain':
      return colors.success(lifecycle);
    default:
      return colors.muted(lifecycle);
  }
}

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
    .description(t('cli:commands.repo.show.description'))
    .argument('<id>', t('cli:commands.repo.show.idArgument'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep repo show abc12345`
    )
    .action(async (id: string) => {
      try {
        const resolved = await resolveRepository(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const repository = resolved.repository;
        const featureRepo = container.resolve<IFeatureRepository>('IFeatureRepository');
        const features = await featureRepo.list({ repositoryPath: repository.path });

        const featureFields =
          features.length > 0
            ? features.map((f) => ({
                label: `${colors.muted(f.id.slice(0, 8))}  ${f.name}`,
                value: colorLifecycle(f.lifecycle),
              }))
            : [{ label: t('cli:commands.repo.show.noFeatures'), value: '\u2014' }];

        renderDetailView({
          title: t('cli:commands.repo.show.title'),
          sections: [
            {
              fields: [
                { label: 'ID', value: repository.id },
                { label: 'Name', value: repository.name },
                { label: 'Path', value: repository.path },
              ],
            },
            {
              title: t('cli:commands.repo.show.timestampsTitle'),
              fields: [
                {
                  label: t('cli:commands.repo.show.createdLabel'),
                  value: formatDate(repository.createdAt),
                },
                {
                  label: t('cli:commands.repo.show.updatedLabel'),
                  value: formatDate(repository.updatedAt),
                },
                {
                  label: t('cli:commands.repo.show.deletedLabel'),
                  value: formatDate(repository.deletedAt),
                },
              ],
            },
            {
              title: t('cli:commands.repo.show.featuresTitle', { count: features.length }),
              fields: featureFields,
            },
          ],
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.repo.show.failedToShow'), err);
        process.exitCode = 1;
      }
    });
}
