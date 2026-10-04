/**
 * shep space new <name> — create a space.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runSpaceCommand } from './run-space-command.js';

interface NewSpaceOptions {
  description?: string;
  color?: string;
  default?: boolean;
}

export function createNewCommand(): Command {
  const t = getCliI18n().t;
  return new Command('new')
    .description(t('cli:commands.space.new.description'))
    .argument('<name>', t('cli:commands.space.nameArg'))
    .option('-d, --description <text>', t('cli:commands.space.descriptionOption'))
    .option('-c, --color <hex>', t('cli:commands.space.colorOption'))
    .option('--default', t('cli:commands.space.new.defaultOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep space new Acme                          Create a space for client work
  $ shep space new Personal --default            Create a space and make it the default
  $ shep space new Globex -c "#c4572f"           Create a space with a colour`
    )
    .action((name: string, options: NewSpaceOptions) =>
      runSpaceCommand(async () => {
        const result = await container.resolve(ManageSpacesUseCase).create({
          name,
          description: options.description,
          color: options.color,
          makeDefault: options.default,
        });
        report(result, ({ space }) =>
          messages.success(
            t('cli:commands.space.new.success', { name: space.name, slug: space.slug })
          )
        );
      })
    );
}
