/**
 * Feature Diff Command (spec 135)
 *
 * What one step changed (`--to` alone), or the difference between any two
 * steps (`--from` and `--to`). A step is a sequence number, a step name
 * (latest checkpoint of that node) or a label such as 0003-implement.
 *
 * Usage: shep feat diff <id> --to <step> [--from <step>] [--stat]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetFeatureCheckpointDiffUseCase } from '@/application/use-cases/features/checkpoints/get-feature-checkpoint-diff.use-case.js';
import { checkpointLabel } from '@/domain/shared/git-checkpoint.js';
import { fmt, messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import {
  formatChangeCounts,
  renderDiff,
  renderDiffStat,
  reportCheckpointError,
} from './checkpoint-output.js';

interface DiffOptions {
  from?: string;
  to: string;
  stat?: boolean;
}

export function createDiffCommand(): Command {
  const t = getCliI18n().t;
  return new Command('diff')
    .description(t('cli:commands.feat.diff.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat diff feat-123 --to implement               What the implement step changed
  $ shep feat diff feat-123 --from plan --to merge       Everything between two steps
  $ shep feat diff feat-123 --from 0 --to 5 --stat       Files only`
    )
    .argument('<id>', t('cli:commands.feat.diff.idArgument'))
    .requiredOption('--to <step>', t('cli:commands.feat.diff.toOption'))
    .option('--from <step>', t('cli:commands.feat.diff.fromOption'))
    .option('--stat', t('cli:commands.feat.diff.statOption'))
    .action(async (featureId: string, options: DiffOptions) => {
      try {
        const diff = await container.resolve(GetFeatureCheckpointDiffUseCase).execute({
          featureId,
          ...(options.from !== undefined ? { from: options.from } : {}),
          to: options.to,
        });

        messages.newline();
        console.log(
          `  ${fmt.heading(`${checkpointLabel(diff.from)} → ${checkpointLabel(diff.to)}`)}  ` +
            `${t('cli:commands.feat.checkpoints.files', { count: diff.filesChanged })} ${formatChangeCounts(
              diff.additions,
              diff.deletions
            )}`
        );
        if (diff.files.length === 0) {
          messages.info(t('cli:commands.feat.diff.noChanges'));
        } else if (options.stat) {
          renderDiffStat(diff.files);
        } else {
          renderDiff(diff.files);
        }
        messages.newline();
      } catch (error) {
        reportCheckpointError(t('cli:commands.feat.diff.failed'), error);
      }
    });
}
