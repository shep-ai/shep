/**
 * Feature Archive Command
 *
 * Archives a feature to hide it from the canvas without deleting it.
 * Stores the current lifecycle state for restoration on unarchive.
 *
 * Usage: shep feat archive <id> [--force]
 *
 * @example
 * $ shep feat archive feat-123
 * $ shep feat archive feat-123 --force
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ShowFeatureUseCase } from '@/application/use-cases/features/show-feature.use-case.js';
import { ArchiveFeatureUseCase } from '@/application/use-cases/features/archive-feature.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { confirm } from '@inquirer/prompts';
import { getCliI18n } from '../../i18n.js';

interface ArchiveOptions {
  force?: boolean;
}

/**
 * Create the feat archive command
 */
export function createArchiveCommand(): Command {
  const t = getCliI18n().t;
  return new Command('archive')
    .description(t('cli:commands.feat.archive.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat archive feat-123            Archive a feature (prompts for confirmation)
  $ shep feat archive feat-123 --force    Archive without confirmation`
    )
    .argument('<id>', t('cli:commands.feat.archive.idArgument'))
    .option('-f, --force', t('cli:commands.feat.archive.forceOption'))
    .action(async (featureId: string, options: ArchiveOptions) => {
      try {
        const showUseCase = container.resolve(ShowFeatureUseCase);
        const feature = await showUseCase.execute(featureId);

        if (!options.force) {
          const confirmed = await confirm({
            message: t('cli:commands.feat.archive.confirmArchive', { name: feature.name }),
            default: false,
          });
          if (!confirmed) {
            messages.info(t('cli:commands.feat.archive.cancelled'));
            return;
          }
        }

        const archiveUseCase = container.resolve(ArchiveFeatureUseCase);
        await archiveUseCase.execute(feature.id);

        messages.newline();
        messages.success(t('cli:commands.feat.archive.featureArchived'));
        console.log(`  ${colors.muted(t('cli:commands.feat.archive.nameLabel'))} ${feature.name}`);
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.archive.failedToArchive'), err);
        process.exitCode = 1;
      }
    });
}
