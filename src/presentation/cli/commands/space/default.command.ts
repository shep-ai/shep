/**
 * shep space default <space> — make a space the one unmatched repositories use.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runSpaceCommand } from './run-space-command.js';

export function createDefaultCommand(): Command {
  const t = getCliI18n().t;
  return new Command('default')
    .description(t('cli:commands.space.default.description'))
    .argument('<space>', t('cli:commands.space.spaceArg'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep space default personal      Repositories no rule matches now land in Personal`
    )
    .action((space: string) =>
      runSpaceCommand(async () => {
        const result = await container.resolve(ManageSpacesUseCase).setDefault(space);
        report(result, ({ space: updated }) =>
          messages.success(t('cli:commands.space.default.success', { name: updated.name }))
        );
      })
    );
}
