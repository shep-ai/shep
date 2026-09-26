/**
 * Application New Command
 *
 * Starts a new app — the first step of "start an app, then add features".
 * By default the app is a blank project whose first feature runs the
 * spec-driven workflow, so research picks the stack. `--starter vite-shadcn`
 * uses the Vite + React + Tailwind + shadcn template instead.
 *
 * Usage:
 *   shep app new <description> [options]
 *
 * @example
 * $ shep app new "A booking tool for climbing gyms"
 * $ shep app new "Landing page for a bakery" --starter vite-shadcn
 * $ shep app new "A CLI that renames photos" --fast
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { StartApplicationUseCase } from '@/application/use-cases/applications/start-application.use-case.js';
import {
  ApplicationStarter,
  BuildMode,
  type Application,
  type Feature,
} from '@/domain/generated/output.js';
import { parseApplicationStarter } from '@/domain/shared/new-project.js';
import { colors, messages, spinner } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

interface NewOptions {
  agent?: string;
  model?: string;
  starter?: string;
  fast?: boolean;
}

export function createNewCommand(): Command {
  const t = getCliI18n().t;
  return new Command('new')
    .description(t('cli:commands.app.new.description'))
    .argument('<description>', t('cli:commands.app.new.descriptionArgument'))
    .option('--starter <starter>', t('cli:commands.app.new.starterOption'))
    .option('--fast', t('cli:commands.app.new.fastOption'))
    .option('--agent <type>', t('cli:commands.app.new.agentOption'))
    .option('--model <model>', t('cli:commands.app.new.modelOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep app new "A booking tool for climbing gyms"
  $ shep app new "Landing page for a bakery" --starter vite-shadcn
  $ cd <app folder> && shep feat new "Add waitlists"`
    )
    .action(async (description: string, options: NewOptions) => {
      try {
        const starter = parseApplicationStarter(options.starter);
        if (starter === null) {
          messages.error(
            t('cli:commands.app.new.invalidStarter', {
              starter: options.starter,
              starters: Object.values(ApplicationStarter).join(', '),
            })
          );
          process.exitCode = 1;
          return;
        }

        const useCase = container.resolve(StartApplicationUseCase);
        const result = await spinner(t('cli:commands.app.new.spinnerText'), () =>
          useCase.execute({
            description,
            starter,
            ...(options.fast ? { buildMode: BuildMode.Fast } : {}),
            ...(options.agent ? { agentType: options.agent } : {}),
            ...(options.model ? { model: options.model } : {}),
          })
        );

        printApplication(result.application, result.repositoryPath);
        printNextSteps(result.repositoryPath, result.feature);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.app.new.failedToCreate'), err);
        process.exitCode = 1;
      }
    });
}

function printApplication(application: Application, repositoryPath: string): void {
  const t = getCliI18n().t;
  const row = (labelKey: string, value: string) =>
    console.log(`  ${colors.muted(t(`cli:commands.app.new.${labelKey}`))}  ${value}`);

  messages.newline();
  messages.success(t('cli:commands.app.new.appCreated'));
  row('idLabel', colors.accent(application.id));
  row('nameLabel', application.name);
  row('slugLabel', application.slug);
  row('pathLabel', repositoryPath);
  row('statusLabel', application.status);
  if (application.agentType) row('agentLabel', application.agentType);
  if (application.modelOverride) row('modelLabel', application.modelOverride);
}

function printNextSteps(repositoryPath: string, feature: Feature | undefined): void {
  const t = getCliI18n().t;
  messages.newline();
  console.log(colors.muted(t('cli:commands.app.new.nextStepsTitle')));
  if (feature) {
    console.log(`  ${t('cli:commands.app.new.firstFeatureStep', { id: feature.id })}`);
  } else {
    console.log(`  ${t('cli:commands.app.new.previewStep')}`);
  }
  console.log(`  ${t('cli:commands.app.new.addFeatureStep', { path: repositoryPath })}`);
  messages.newline();
}
