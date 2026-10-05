/**
 * Autopilot Command Group (spec 132)
 *
 * What shep starts on its own in a space: investigating urgent work items,
 * fixing confident hypotheses and building the week's line.
 *
 * Usage:
 *   shep autopilot show [--space]
 *   shep autopilot set [--space] [--investigate] [--fix] [--merge-fixes] [--fill-line]
 *                      [--project <p> | --clear-project] [--budget <n>]
 *   shep autopilot run [--space]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import {
  ManageAutopilotUseCase,
  type AutopilotChange,
} from '@/application/use-cases/autopilot/manage-autopilot.use-case.js';
import { RunAutopilotUseCase } from '@/application/use-cases/autopilot/run-autopilot.use-case.js';
import { colors, messages, renderDetailView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { parseNumberOption } from '../number-option.js';
import { onOff, printPass } from './format-pass.js';

const FAILED = 'cli:commands.autopilot.failed';

interface SetOptions {
  space?: string;
  investigate?: boolean;
  fix?: boolean;
  mergeFixes?: boolean;
  fillLine?: boolean;
  project?: string;
  clearProject?: boolean;
  budget?: string;
}

function createShowCommand(): Command {
  const t = getCliI18n().t;
  return new Command('show')
    .description(t('cli:commands.autopilot.show.description'))
    .option('-s, --space <space>', t('cli:commands.autopilot.spaceOption'))
    .action((options: { space?: string }) =>
      runCommand(FAILED, async () => {
        report(await container.resolve(ManageAutopilotUseCase).get(options.space), (view) => {
          const { policy } = view;
          renderDetailView({
            title: t('cli:commands.autopilot.show.title', { space: view.space.name }),
            sections: [
              {
                fields: [
                  {
                    label: t('cli:commands.autopilot.investigate'),
                    value: onOff(policy.investigateUrgent),
                  },
                  { label: t('cli:commands.autopilot.fix'), value: onOff(policy.fixConfident) },
                  {
                    label: t('cli:commands.autopilot.mergeFixes'),
                    value: onOff(policy.mergeFixes),
                  },
                  {
                    label: t('cli:commands.autopilot.budget'),
                    value: String(policy.dailyFixBudget),
                  },
                  { label: t('cli:commands.autopilot.fillLine'), value: onOff(policy.fillLine) },
                  {
                    label: t('cli:commands.autopilot.project'),
                    value: view.project
                      ? `${view.project.name} (${view.project.slug})`
                      : colors.muted('-'),
                  },
                ],
              },
            ],
          });
          if (view.runs.length === 0) messages.info(t('cli:commands.autopilot.show.noRuns'));
          for (const run of view.runs) printPass(run);
        });
      })
    );
}

function change(options: SetOptions, budget: number | undefined): AutopilotChange {
  return {
    ...(options.investigate === undefined ? {} : { investigateUrgent: options.investigate }),
    ...(options.fix === undefined ? {} : { fixConfident: options.fix }),
    ...(options.mergeFixes === undefined ? {} : { mergeFixes: options.mergeFixes }),
    ...(options.fillLine === undefined ? {} : { fillLine: options.fillLine }),
    ...(options.clearProject ? { project: null } : {}),
    ...(options.project === undefined ? {} : { project: options.project }),
    ...(budget === undefined ? {} : { dailyFixBudget: budget }),
  };
}

function createSetCommand(): Command {
  const t = getCliI18n().t;
  return new Command('set')
    .description(t('cli:commands.autopilot.set.description'))
    .option('-s, --space <space>', t('cli:commands.autopilot.spaceOption'))
    .option('--investigate', t('cli:commands.autopilot.set.investigateOption'))
    .option('--no-investigate', t('cli:commands.autopilot.set.offOption'))
    .option('--fix', t('cli:commands.autopilot.set.fixOption'))
    .option('--no-fix', t('cli:commands.autopilot.set.offOption'))
    .option('--merge-fixes', t('cli:commands.autopilot.set.mergeFixesOption'))
    .option('--no-merge-fixes', t('cli:commands.autopilot.set.offOption'))
    .option('--fill-line', t('cli:commands.autopilot.set.fillLineOption'))
    .option('--no-fill-line', t('cli:commands.autopilot.set.offOption'))
    .option('--project <project>', t('cli:commands.autopilot.set.projectOption'))
    .option('--clear-project', t('cli:commands.autopilot.set.clearProjectOption'))
    .option('--budget <fixes>', t('cli:commands.autopilot.set.budgetOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep autopilot set --space acme --investigate --fix --budget 3
  $ shep autopilot set --space acme --fill-line --project pay
  $ shep autopilot set --space acme --no-fix`
    )
    .action((options: SetOptions) =>
      runCommand(FAILED, async () => {
        const budget = parseNumberOption('--budget', options.budget);
        if (!budget.ok) return;
        const result = await container
          .resolve(ManageAutopilotUseCase)
          .set(options.space, change(options, budget.value));
        report(result, () => messages.success(t('cli:commands.autopilot.set.success')));
      })
    );
}

function createRunCommand(): Command {
  const t = getCliI18n().t;
  return new Command('run')
    .description(t('cli:commands.autopilot.run.description'))
    .option('-s, --space <space>', t('cli:commands.autopilot.spaceOption'))
    .action((options: { space?: string }) =>
      runCommand(FAILED, async () => {
        messages.info(t('cli:commands.autopilot.run.started'));
        report(await container.resolve(RunAutopilotUseCase).run(options.space), ({ run }) =>
          printPass(run)
        );
      })
    );
}

export function createAutopilotCommand(): Command {
  return new Command('autopilot')
    .description(getCliI18n().t('cli:commands.autopilot.description'))
    .addCommand(createShowCommand())
    .addCommand(createSetCommand())
    .addCommand(createRunCommand());
}
