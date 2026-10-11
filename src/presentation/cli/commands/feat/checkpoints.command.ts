/**
 * Feature Checkpoints Command (spec 138)
 *
 * Lists the hidden-ref snapshots taken after each step of a feature's run.
 *
 * Usage: shep feat checkpoints <id>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListFeatureCheckpointsUseCase } from '@/application/use-cases/features/checkpoints/list-feature-checkpoints.use-case.js';
import { checkpointLabel } from '@/domain/shared/git-checkpoint.js';
import { colors, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { formatChangeCounts, reportCheckpointError, shortSha } from './checkpoint-output.js';

const LABEL_WIDTH = 28;
const TIME_WIDTH = 20;
const CHANGES_WIDTH = 22;

export function createCheckpointsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('checkpoints')
    .description(t('cli:commands.feat.checkpoints.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat checkpoints feat-123                       List the steps of a feature
  $ shep feat diff feat-123 --to implement               What the implement step changed
  $ shep feat restore feat-123 0002-plan                 Roll the worktree back to a step`
    )
    .argument('<id>', t('cli:commands.feat.checkpoints.idArgument'))
    .action(async (featureId: string) => {
      try {
        const result = await container.resolve(ListFeatureCheckpointsUseCase).execute(featureId);
        renderListView({
          title: t('cli:commands.feat.checkpoints.title', { name: result.featureName }),
          columns: [
            { label: t('cli:commands.feat.checkpoints.stepColumn'), width: LABEL_WIDTH },
            { label: t('cli:commands.feat.checkpoints.timeColumn'), width: TIME_WIDTH },
            { label: t('cli:commands.feat.checkpoints.changesColumn'), width: CHANGES_WIDTH },
            { label: t('cli:commands.feat.checkpoints.commitColumn'), width: 0 },
          ],
          rows: result.checkpoints.map((c) => [
            checkpointLabel(c),
            colors.muted(new Date(c.createdAt).toLocaleString()),
            `${t('cli:commands.feat.checkpoints.files', { count: c.filesChanged })} ${formatChangeCounts(c.additions, c.deletions)}`,
            colors.muted(shortSha(c.commitSha)),
          ]),
          emptyMessage: t('cli:commands.feat.checkpoints.empty'),
        });
      } catch (error) {
        reportCheckpointError(t('cli:commands.feat.checkpoints.failed'), error);
      }
    });
}
