/** shep outcome ls | check (spec 130). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageOutcomesUseCase } from '@/application/use-cases/outcomes/manage-outcomes.use-case.js';
import { TrackOutcomesUseCase } from '@/application/use-cases/outcomes/track-outcomes.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { formatCalibration, formatCounts } from './format-outcome.js';

export const FAILED = 'cli:commands.outcome.failed';

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.outcome.ls.description'))
    .option('-s, --space <space>', t('cli:commands.outcome.spaceOption'))
    .action((options: { space?: string }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageOutcomesUseCase).list(options.space);
        report(result, ({ space, outcomes, calibration }) => {
          renderListView({
            title: t('cli:commands.outcome.ls.title', { space: space.name }),
            columns: [
              { label: t('cli:commands.outcome.ls.opportunityColumn'), width: 36 },
              { label: t('cli:commands.outcome.ls.shippedColumn'), width: 12 },
              { label: t('cli:commands.outcome.ls.verdictColumn'), width: 11 },
              { label: t('cli:commands.outcome.ls.reportsColumn'), width: 9 },
              { label: t('cli:commands.outcome.ls.tellColumn'), width: 8 },
            ],
            rows: outcomes.map(({ outcome, opportunity, customers }) => [
              opportunity.title,
              outcome.shippedAt.toISOString().slice(0, 10),
              outcome.verdict,
              formatCounts(outcome),
              String(customers.length),
            ]),
            emptyMessage: t('cli:commands.outcome.ls.empty'),
          });
          messages.info(formatCalibration(calibration));
        });
      })
    );
}

export function createCheckCommand(): Command {
  const t = getCliI18n().t;
  return new Command('check').description(t('cli:commands.outcome.check.description')).action(() =>
    runCommand(FAILED, async () => {
      const sweep = await container.resolve(TrackOutcomesUseCase).run();
      messages.success(
        t('cli:commands.outcome.check.summary', {
          shipped: sweep.shipped.length,
          reopened: sweep.reopened.length,
          judged: sweep.judged.length,
        })
      );
      for (const opportunity of sweep.shipped) {
        messages.info(`  ${t('cli:commands.outcome.check.shipped')} ${opportunity.title}`);
      }
      for (const opportunity of sweep.reopened) {
        messages.info(`  ${t('cli:commands.outcome.check.reopened')} ${opportunity.title}`);
      }
      for (const outcome of sweep.judged) {
        messages.info(
          `  ${outcome.verdict} ${formatCounts(outcome)} ${colors.muted(outcome.opportunityId)}`
        );
      }
    })
  );
}
