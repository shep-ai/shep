/**
 * shep space assign|unassign — pin one repository to a space, overriding every
 * rule, or remove the pin so the rules apply again.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageSpaceMembershipUseCase } from '@/application/use-cases/spaces/manage-space-membership.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { resolveCliPath } from '../../paths.js';
import { report, runSpaceCommand } from './run-space-command.js';

export function createAssignCommand(): Command {
  const t = getCliI18n().t;
  return new Command('assign')
    .description(t('cli:commands.space.assign.description'))
    .argument('<space>', t('cli:commands.space.spaceArg'))
    .argument('[path]', t('cli:commands.space.pathArg'))
    .option('-l, --line <line>', t('cli:commands.space.lineOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep space assign personal                 Pin the current repository to Personal
  $ shep space assign acme ~/oss/fork -l web   Pin another repository to a product line`
    )
    .action((space: string, path: string | undefined, options: { line?: string }) =>
      runSpaceCommand(async () => {
        const result = await container.resolve(ManageSpaceMembershipUseCase).assign({
          repositoryPath: resolveCliPath(path),
          space,
          productLine: options.line,
        });
        report(result, ({ assignment }) =>
          messages.success(
            t('cli:commands.space.assign.success', { path: assignment.repositoryPath, space })
          )
        );
      })
    );
}

export function createUnassignCommand(): Command {
  const t = getCliI18n().t;
  return new Command('unassign')
    .description(t('cli:commands.space.unassign.description'))
    .argument('[path]', t('cli:commands.space.pathArg'))
    .action((path: string | undefined) =>
      runSpaceCommand(async () => {
        const repositoryPath = resolveCliPath(path);
        const result = await container
          .resolve(ManageSpaceMembershipUseCase)
          .unassign(repositoryPath);
        report(result, () =>
          messages.success(t('cli:commands.space.unassign.success', { path: repositoryPath }))
        );
      })
    );
}
