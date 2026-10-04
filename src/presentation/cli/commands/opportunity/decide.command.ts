/** shep opportunity add | estimate | link | unlink | accept | drop | build (spec 126). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageOpportunitiesUseCase } from '@/application/use-cases/opportunities/manage-opportunities.use-case.js';
import { ManageSignalsUseCase } from '@/application/use-cases/opportunities/manage-signals.use-case.js';
import { BuildOpportunityUseCase } from '@/application/use-cases/opportunities/build-opportunity.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { parseNumberOption } from '../number-option.js';

export const FAILED = 'cli:commands.opportunity.failed';

interface EstimateOptions {
  hours?: string;
  confidence?: string;
  strategic?: boolean;
  problem?: string;
}

interface AddOptions extends EstimateOptions {
  hours: string;
  space?: string;
  productLine?: string;
}

/** The parsed estimate options, or undefined after printing why one is refused. */
function parseEstimate(options: EstimateOptions) {
  const hours = parseNumberOption('--hours', options.hours);
  if (!hours.ok) return undefined;
  const confidence = parseNumberOption('--confidence', options.confidence);
  if (!confidence.ok) return undefined;
  return {
    ...(hours.value === undefined ? {} : { reviewHours: hours.value }),
    ...(confidence.value === undefined ? {} : { confidence: confidence.value }),
    ...(options.strategic ? { strategic: true } : {}),
    ...(options.problem ? { problem: options.problem } : {}),
  };
}

export function createAddCommand(): Command {
  const t = getCliI18n().t;
  return new Command('add')
    .description(t('cli:commands.opportunity.add.description'))
    .argument('<title>', t('cli:commands.opportunity.add.titleArg'))
    .requiredOption('-h, --hours <hours>', t('cli:commands.opportunity.hoursOption'))
    .option('-c, --confidence <0-1>', t('cli:commands.opportunity.confidenceOption'))
    .option('--strategic', t('cli:commands.opportunity.strategicOption'))
    .option('-p, --problem <text>', t('cli:commands.opportunity.problemOption'))
    .option('-s, --space <space>', t('cli:commands.opportunity.spaceOption'))
    .option('-l, --product-line <line>', t('cli:commands.opportunity.add.productLineOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep opportunity add "Faster guest checkout" --hours 6 --confidence 0.7 --space acme
  $ shep opportunity add "SSO for enterprise" --hours 20 --strategic --problem "Deals stall at security review"`
    )
    .action((title: string, options: AddOptions) =>
      runCommand(FAILED, async () => {
        const estimate = parseEstimate(options);
        if (!estimate) return;
        const result = await container.resolve(ManageOpportunitiesUseCase).create({
          title,
          reviewHours: estimate.reviewHours ?? Number.NaN,
          ...estimate,
          ...(options.space ? { space: options.space } : {}),
          ...(options.productLine ? { productLine: options.productLine } : {}),
        });
        report(result, ({ opportunity }) =>
          messages.success(t('cli:commands.opportunity.add.success', { id: opportunity.id }))
        );
      })
    );
}

export function createEstimateCommand(): Command {
  const t = getCliI18n().t;
  return new Command('estimate')
    .description(t('cli:commands.opportunity.estimate.description'))
    .argument('<opportunity>', t('cli:commands.opportunity.opportunityArg'))
    .option('-h, --hours <hours>', t('cli:commands.opportunity.hoursOption'))
    .option('-c, --confidence <0-1>', t('cli:commands.opportunity.confidenceOption'))
    .option('--strategic', t('cli:commands.opportunity.strategicOption'))
    .option('-p, --problem <text>', t('cli:commands.opportunity.problemOption'))
    .action((id: string, options: EstimateOptions) =>
      runCommand(FAILED, async () => {
        const estimate = parseEstimate(options);
        if (!estimate) return;
        const result = await container.resolve(ManageOpportunitiesUseCase).estimate(id, estimate);
        report(result, () =>
          messages.success(t('cli:commands.opportunity.estimate.success', { id }))
        );
      })
    );
}

export function createLinkCommands(): Command[] {
  const t = getCliI18n().t;
  const link = new Command('link')
    .description(t('cli:commands.opportunity.link.description'))
    .argument('<signal>', t('cli:commands.opportunity.signalArg'))
    .argument('<opportunity>', t('cli:commands.opportunity.opportunityArg'))
    .action((signal: string, opportunity: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageSignalsUseCase).link(signal, opportunity);
        report(result, () =>
          messages.success(t('cli:commands.opportunity.link.success', { signal, opportunity }))
        );
      })
    );
  const unlink = new Command('unlink')
    .description(t('cli:commands.opportunity.unlink.description'))
    .argument('<signal>', t('cli:commands.opportunity.signalArg'))
    .action((signal: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageSignalsUseCase).link(signal, null);
        report(result, () =>
          messages.success(t('cli:commands.opportunity.unlink.success', { signal }))
        );
      })
    );
  return [link, unlink];
}

export function createDecisionCommands(): Command[] {
  const t = getCliI18n().t;
  const accept = new Command('accept')
    .description(t('cli:commands.opportunity.accept.description'))
    .argument('<opportunity>', t('cli:commands.opportunity.opportunityArg'))
    .action((id: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageOpportunitiesUseCase).accept(id);
        report(result, ({ opportunity }) =>
          messages.success(
            t('cli:commands.opportunity.accept.success', { title: opportunity.title })
          )
        );
      })
    );
  const drop = new Command('drop')
    .description(t('cli:commands.opportunity.drop.description'))
    .argument('<opportunity>', t('cli:commands.opportunity.opportunityArg'))
    .requiredOption('-r, --reason <text>', t('cli:commands.opportunity.drop.reasonOption'))
    .action((id: string, options: { reason: string }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageOpportunitiesUseCase).drop(id, options.reason);
        report(result, ({ opportunity }) =>
          messages.success(t('cli:commands.opportunity.drop.success', { title: opportunity.title }))
        );
      })
    );
  const build = new Command('build')
    .description(t('cli:commands.opportunity.build.description'))
    .argument('<opportunity>', t('cli:commands.opportunity.opportunityArg'))
    .requiredOption('-p, --project <project>', t('cli:commands.opportunity.build.projectOption'))
    .action((id: string, options: { project: string }) =>
      runCommand(FAILED, async () => {
        const result = await container
          .resolve(BuildOpportunityUseCase)
          .execute(id, options.project);
        report(result, ({ opportunity, workItem }) =>
          messages.success(
            t('cli:commands.opportunity.build.success', {
              title: opportunity.title,
              workItem: workItem.id,
            })
          )
        );
      })
    );
  return [accept, drop, build];
}
