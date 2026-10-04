/**
 * shep space rm <space> — delete a space. Refused for the default space and
 * for a space that still holds memory.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runSpaceCommand } from './run-space-command.js';

export function createRmCommand(): Command {
  const t = getCliI18n().t;
  return new Command('rm')
    .description(t('cli:commands.space.rm.description'))
    .argument('<space>', t('cli:commands.space.spaceArg'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep space rm globex      Delete a space (its rules, assignments and lines go with it)`
    )
    .action((space: string) =>
      runSpaceCommand(async () => {
        const result = await container.resolve(ManageSpacesUseCase).delete(space);
        report(result, () => messages.success(t('cli:commands.space.rm.success', { space })));
      })
    );
}
