/**
 * `shep contributors recap` — generates a month's contributor recap and
 * publishes it to `recaps/<YYYY-MM>.md`. Run by
 * `.github/workflows/contributor-maintenance.yml` on the first of each month;
 * it used to run as a watcher inside every user's daemon (spec 097, FR-31).
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GenerateMonthlyRecapUseCase } from '@/application/use-cases/contributors/generate-monthly-recap.use-case.js';
import { PublishMonthlyRecapUseCase } from '@/application/use-cases/contributors/publish-monthly-recap.use-case.js';
import { RecapChannel } from '@/domain/generated/output.js';
import { previousYearMonth } from '@/domain/shared/previous-year-month.js';
import { messages } from '../../ui/index.js';

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function createRecapCommand(): Command {
  return new Command('recap')
    .description('Generate and publish a monthly contributor recap (maintainer workflow entry).')
    .option('-m, --month <YYYY-MM>', 'Month to recap (default: the previous calendar month)')
    .addHelpText(
      'after',
      `
Examples:
  $ shep contributors recap                  Recap the previous calendar month
  $ shep contributors recap --month 2026-09  Recap September 2026`
    )
    .action(async (options: { month?: string }) => {
      try {
        const yearMonth = options.month ?? previousYearMonth(new Date());
        if (!YEAR_MONTH.test(yearMonth)) {
          throw new Error(`--month must look like 2026-09, got "${yearMonth}".`);
        }

        const { artifact } = await container
          .resolve(GenerateMonthlyRecapUseCase)
          .execute({ yearMonth });
        const { outcomes } = await container.resolve(PublishMonthlyRecapUseCase).execute({
          artifact,
          targets: [{ channel: RecapChannel.File }],
        });

        for (const outcome of outcomes) {
          switch (outcome.status) {
            case 'published':
              messages.success(`Published ${yearMonth} recap: ${outcome.reference}`);
              break;
            case 'denied':
              messages.info(`${outcome.channel} publish denied: ${outcome.rationale}`);
              break;
            case 'skipped':
              messages.info(`${outcome.channel} skipped: ${outcome.reason}`);
              break;
            case 'failed':
              messages.error(`${outcome.channel} publish failed: ${outcome.error}`);
              process.exitCode = 1;
              break;
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to publish the contributor recap', err);
        process.exitCode = 1;
      }
    });
}
