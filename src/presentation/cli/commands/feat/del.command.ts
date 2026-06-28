/**
 * Feature Delete Command
 *
 * Deletes a feature, its worktree, and cancels any running agent.
 * Optionally cleans up worktree and branches (local + remote).
 *
 * Usage: shep feat del <id> [--force] [--no-cleanup] [--no-close-pr]
 *
 * @example
 * $ shep feat del feat-123
 * $ shep feat del feat-123 --force
 * $ shep feat del feat-123 --force --no-cleanup
 * $ shep feat del feat-123 --force --no-close-pr
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { DeleteFeatureUseCase } from '@/application/use-cases/features/delete-feature.use-case.js';
import { ShowFeatureUseCase } from '@/application/use-cases/features/show-feature.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { confirm } from '@inquirer/prompts';
import { getCliI18n } from '../../i18n.js';

interface DelOptions {
  force?: boolean;
  cleanup?: boolean;
  closePr?: boolean;
}

/**
 * Create the feat del command
 */
export function createDelCommand(): Command {
  const t = getCliI18n().t;
  return new Command('del')
    .description(t('cli:commands.feat.del.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat del feat-123                           Delete a feature (prompts for confirmation)
  $ shep feat del feat-123 --force                   Delete without confirmation
  $ shep feat del feat-123 --force --no-cleanup      Delete but keep worktree and branches
  $ shep feat del feat-123 --force --no-close-pr     Delete but leave the open PR open`
    )
    .argument('<id>', t('cli:commands.feat.del.idArgument'))
    .option('-f, --force', t('cli:commands.feat.del.forceOption'))
    .option('--no-cleanup', t('cli:commands.feat.del.noCleanupOption'))
    .option('--no-close-pr', t('cli:commands.feat.del.noClosePrOption'))
    .action(async (featureId: string, options: DelOptions) => {
      try {
        // First show what we're about to delete
        const showUseCase = container.resolve(ShowFeatureUseCase);
        const feature = await showUseCase.execute(featureId);

        if (!options.force) {
          const confirmed = await confirm({
            message: t('cli:commands.feat.del.confirmDelete', { name: feature.name }),
            default: false,
          });
          if (!confirmed) {
            messages.info(t('cli:commands.feat.del.cancelled'));
            return;
          }
        }

        // Determine cleanup preference
        let cleanup = true;
        if (options.cleanup === false) {
          cleanup = false;
        } else if (!options.force) {
          cleanup = await confirm({
            message: t('cli:commands.feat.del.confirmCleanup'),
            default: true,
          });
        }

        // Determine close-PR preference
        const hasOpenPr = feature.pr?.status === 'Open';
        let closePr: boolean | undefined;
        if (options.closePr === false) {
          closePr = false;
        } else if (hasOpenPr && cleanup) {
          if (options.force) {
            closePr = true;
          } else {
            closePr = await confirm({
              message: t('cli:commands.feat.del.confirmClosePr', { number: feature.pr!.number }),
              default: true,
            });
          }
        }

        const deleteUseCase = container.resolve(DeleteFeatureUseCase);
        const executeOptions: { cleanup: boolean; closePr?: boolean } = { cleanup };
        if (closePr !== undefined) {
          executeOptions.closePr = closePr;
        }
        await deleteUseCase.execute(feature.id, executeOptions);

        messages.newline();
        messages.success(t('cli:commands.feat.del.featureDeleted'));
        console.log(`  ${colors.muted(t('cli:commands.feat.del.nameLabel'))}   ${feature.name}`);
        console.log(`  ${colors.muted(t('cli:commands.feat.del.branchLabel'))} ${feature.branch}`);
        if (cleanup) {
          console.log(
            `  ${colors.muted(t('cli:commands.feat.del.cleanupLabel'))} ${t('cli:commands.feat.del.cleanupDetail')}`
          );
        }
        if (closePr && hasOpenPr) {
          console.log(
            `  ${colors.muted(t('cli:commands.feat.del.prLabel'))}     ${t('cli:commands.feat.del.prClosed', { number: feature.pr!.number })}`
          );
        }
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.del.failedToDelete'), err);
        process.exitCode = 1;
      }
    });
}
