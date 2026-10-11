/**
 * Feature Restore Command (spec 138)
 *
 * Rolls a feature's worktree back to one of its checkpoints. Only the
 * feature's own worktree, only while no agent is running; the branch is not
 * moved, and the state before the restore is kept as a checkpoint.
 *
 * Usage: shep feat restore <id> <step> [--force]
 */

import { Command } from 'commander';
import { confirm } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { RestoreFeatureCheckpointUseCase } from '@/application/use-cases/features/checkpoints/restore-feature-checkpoint.use-case.js';
import { checkpointLabel } from '@/domain/shared/git-checkpoint.js';
import { fmt, messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { reportCheckpointError } from './checkpoint-output.js';

interface RestoreOptions {
  force?: boolean;
}

export function createRestoreCommand(): Command {
  const t = getCliI18n().t;
  return new Command('restore')
    .description(t('cli:commands.feat.restore.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat restore feat-123 plan                      Back to the worktree after "plan"
  $ shep feat restore feat-123 0000-baseline --force     Back to the start, no prompt`
    )
    .argument('<id>', t('cli:commands.feat.restore.idArgument'))
    .argument('<step>', t('cli:commands.feat.restore.stepArgument'))
    .option('-f, --force', t('cli:commands.feat.restore.forceOption'))
    .action(async (featureId: string, step: string, options: RestoreOptions) => {
      try {
        if (!options.force) {
          const confirmed = await confirm({
            message: t('cli:commands.feat.restore.confirm', { step }),
            default: false,
          });
          if (!confirmed) {
            messages.info(t('cli:commands.feat.restore.cancelled'));
            return;
          }
        }

        const result = await container
          .resolve(RestoreFeatureCheckpointUseCase)
          .execute({ featureId, step });

        messages.newline();
        messages.success(
          t('cli:commands.feat.restore.restored', { step: checkpointLabel(result.restored) })
        );
        if (result.safety) {
          const undo = `shep feat restore ${result.safety.featureId} ${checkpointLabel(result.safety)}`;
          console.log(`  ${t('cli:commands.feat.restore.undoHint')} ${fmt.code(undo)}`);
        }
        messages.newline();
      } catch (error) {
        reportCheckpointError(t('cli:commands.feat.restore.failed'), error);
      }
    });
}
