/**
 * Feature Unarchive Command
 *
 * Restores an archived feature to its previous lifecycle state.
 * No confirmation needed — unarchive is always safe and non-destructive.
 *
 * Usage: shep feat unarchive <id>
 *
 * @example
 * $ shep feat unarchive feat-123
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ShowFeatureUseCase } from '@/application/use-cases/features/show-feature.use-case.js';
import { UnarchiveFeatureUseCase } from '@/application/use-cases/features/unarchive-feature.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

/**
 * Create the feat unarchive command
 */
export function createUnarchiveCommand(): Command {
  const t = getCliI18n().t;
  return new Command('unarchive')
    .description(t('cli:commands.feat.unarchive.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat unarchive feat-123    Restore an archived feature to its previous lifecycle`
    )
    .argument('<id>', t('cli:commands.feat.unarchive.idArgument'))
    .action(async (featureId: string) => {
      try {
        const showUseCase = container.resolve(ShowFeatureUseCase);
        const feature = await showUseCase.execute(featureId);

        const unarchiveUseCase = container.resolve(UnarchiveFeatureUseCase);
        const restored = await unarchiveUseCase.execute(feature.id);

        messages.newline();
        messages.success(t('cli:commands.feat.unarchive.featureUnarchived'));
        console.log(
          `  ${colors.muted(t('cli:commands.feat.unarchive.nameLabel'))}     ${feature.name}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.unarchive.restoredLabel'))} ${restored.lifecycle}`
        );
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.unarchive.failedToUnarchive'), err);
        process.exitCode = 1;
      }
    });
}
