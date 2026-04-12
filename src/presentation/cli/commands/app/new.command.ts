/**
 * Application New Command
 *
 * Creates a new application with optional initial prompt to kick off
 * an interactive agent session.
 *
 * Usage:
 *   shep app new <description> [options]
 *
 * @example
 * $ shep app new "Build a todo list app with React"
 * $ shep app new "REST API for inventory management" --agent claude-code
 * $ shep app new "Portfolio website" --model claude-opus-4-6
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { CreateApplicationUseCase } from '@/application/use-cases/applications/create-application.use-case.js';
import { colors, messages, spinner } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

interface NewOptions {
  agent?: string;
  model?: string;
}

export function createNewCommand(): Command {
  const t = getCliI18n().t;
  return new Command('new')
    .description(t('cli:commands.app.new.description'))
    .argument('<description>', t('cli:commands.app.new.descriptionArgument'))
    .option('--agent <type>', t('cli:commands.app.new.agentOption'))
    .option('--model <model>', t('cli:commands.app.new.modelOption'))
    .action(async (description: string, options: NewOptions) => {
      try {
        const useCase = container.resolve(CreateApplicationUseCase);
        const result = await spinner(t('cli:commands.app.new.spinnerText'), () =>
          useCase.execute({
            description,
            agentType: options.agent,
            modelOverride: options.model,
            initialPrompt: description,
          })
        );

        const { application } = result;

        messages.newline();
        messages.success(t('cli:commands.app.new.appCreated'));
        console.log(
          `  ${colors.muted(t('cli:commands.app.new.idLabel'))}       ${colors.accent(application.id)}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.app.new.nameLabel'))}     ${application.name}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.app.new.slugLabel'))}     ${application.slug}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.app.new.pathLabel'))}     ${result.repositoryPath}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.app.new.statusLabel'))}   ${application.status}`
        );
        if (application.agentType) {
          console.log(
            `  ${colors.muted(t('cli:commands.app.new.agentLabel'))}    ${application.agentType}`
          );
        }
        if (application.modelOverride) {
          console.log(
            `  ${colors.muted(t('cli:commands.app.new.modelLabel'))}    ${application.modelOverride}`
          );
        }
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.app.new.failedToCreate'), err);
        process.exitCode = 1;
      }
    });
}
