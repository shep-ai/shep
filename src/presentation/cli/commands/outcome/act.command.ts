/** shep outcome ship | tell | hours (spec 130). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageOutcomesUseCase } from '@/application/use-cases/outcomes/manage-outcomes.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { parseNumberOption } from '../number-option.js';
import { FAILED } from './list.command.js';

export function createShipCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ship')
    .description(t('cli:commands.outcome.ship.description'))
    .argument('<opportunity>', t('cli:commands.outcome.opportunityArg'))
    .action((id: string) =>
      runCommand(FAILED, async () => {
        report(
          await container.resolve(ManageOutcomesUseCase).ship(id),
          ({ opportunity, outcome }) =>
            messages.success(
              t('cli:commands.outcome.ship.success', {
                title: opportunity.title,
                date: outcome.reviewAt.toISOString().slice(0, 10),
              })
            )
        );
      })
    );
}

export function createTellCommand(): Command {
  const t = getCliI18n().t;
  return new Command('tell')
    .description(t('cli:commands.outcome.tell.description'))
    .argument('<opportunity>', t('cli:commands.outcome.opportunityArg'))
    .option('--done', t('cli:commands.outcome.tell.doneOption'))
    .action((id: string, options: { done?: boolean }) =>
      runCommand(FAILED, async () => {
        const outcomes = container.resolve(ManageOutcomesUseCase);
        if (options.done) {
          report(await outcomes.tell(id), ({ customers }) =>
            messages.success(t('cli:commands.outcome.tell.told', { told: customers.length }))
          );
          return;
        }
        report(await outcomes.show(id), ({ view }) => {
          if (view.customers.length === 0) {
            messages.info(t('cli:commands.outcome.tell.nobody'));
            return;
          }
          messages.info(t('cli:commands.outcome.tell.note', { title: view.opportunity.title }));
          for (const { customer, urls } of view.customers) {
            messages.info(`  ${customer} ${colors.muted(urls.join(' '))}`);
          }
          messages.info(t('cli:commands.outcome.tell.markHint', { id: view.opportunity.id }));
        });
      })
    );
}

export function createHoursCommand(): Command {
  const t = getCliI18n().t;
  return new Command('hours')
    .description(t('cli:commands.outcome.hours.description'))
    .argument('<opportunity>', t('cli:commands.outcome.opportunityArg'))
    .argument('<hours>', t('cli:commands.outcome.hours.hoursArg'))
    .action((id: string, hours: string) =>
      runCommand(FAILED, async () => {
        const parsed = parseNumberOption('<hours>', hours);
        if (!parsed.ok || parsed.value === undefined) return;
        report(
          await container.resolve(ManageOutcomesUseCase).recordHours(id, parsed.value),
          ({ outcome }) =>
            messages.success(
              t('cli:commands.outcome.hours.success', { hours: outcome.actualReviewHours })
            )
        );
      })
    );
}
