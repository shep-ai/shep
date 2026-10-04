/**
 * shep space line new|rm — product lines group repositories inside a space.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runSpaceCommand } from './run-space-command.js';

export function createLineCommand(): Command {
  const t = getCliI18n().t;

  const create = new Command('new')
    .description(t('cli:commands.space.line.new.description'))
    .argument('<space>', t('cli:commands.space.spaceArg'))
    .argument('<name>', t('cli:commands.space.nameArg'))
    .option('-d, --description <text>', t('cli:commands.space.descriptionOption'))
    .action((space: string, name: string, options: { description?: string }) =>
      runSpaceCommand(async () => {
        const result = await container
          .resolve(ManageSpacesUseCase)
          .createProductLine(space, { name, description: options.description });
        report(result, ({ productLine }) =>
          messages.success(
            t('cli:commands.space.line.new.success', {
              name: productLine.name,
              slug: productLine.slug,
            })
          )
        );
      })
    );

  const remove = new Command('rm')
    .description(t('cli:commands.space.line.rm.description'))
    .argument('<space>', t('cli:commands.space.spaceArg'))
    .argument('<line>', t('cli:commands.space.lineArg'))
    .action((space: string, line: string) =>
      runSpaceCommand(async () => {
        const result = await container.resolve(ManageSpacesUseCase).deleteProductLine(space, line);
        report(result, () => messages.success(t('cli:commands.space.line.rm.success', { line })));
      })
    );

  return new Command('line')
    .description(t('cli:commands.space.line.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep space line new acme Payments      Add a product line to a space
  $ shep space line rm acme payments       Remove it (repositories keep their space)`
    )
    .addCommand(create)
    .addCommand(remove);
}
