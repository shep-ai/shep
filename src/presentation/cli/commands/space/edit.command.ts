/**
 * shep space edit <space> — rename a space or change its description or colour.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runSpaceCommand } from './run-space-command.js';

interface EditSpaceOptions {
  name?: string;
  description?: string;
  color?: string;
}

export function createEditCommand(): Command {
  const t = getCliI18n().t;
  return new Command('edit')
    .description(t('cli:commands.space.edit.description'))
    .argument('<space>', t('cli:commands.space.spaceArg'))
    .option('-n, --name <name>', t('cli:commands.space.nameArg'))
    .option('-d, --description <text>', t('cli:commands.space.descriptionOption'))
    .option('-c, --color <hex>', t('cli:commands.space.colorOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep space edit acme --name "Acme Corp"      Rename a space
  $ shep space edit acme --color ""              Clear a space's colour`
    )
    .action((space: string, options: EditSpaceOptions) =>
      runSpaceCommand(async () => {
        const result = await container.resolve(ManageSpacesUseCase).update(space, options);
        report(result, ({ space: updated }) =>
          messages.success(t('cli:commands.space.edit.success', { name: updated.name }))
        );
      })
    );
}
