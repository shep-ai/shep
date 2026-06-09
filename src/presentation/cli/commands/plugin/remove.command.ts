/**
 * Plugin Remove Command
 *
 * Remove an installed plugin from the registry.
 *
 * Usage:
 *   shep plugin remove mempalace
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { RemovePluginUseCase } from '@/application/use-cases/plugins/remove-plugin.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function createRemoveCommand(): Command {
  const t = getCliI18n().t;
  return new Command('remove')
    .description(t('cli:commands.plugin.remove.description'))
    .argument('<name>', t('cli:commands.plugin.remove.nameArg'))
    .action(async (name: string) => {
      try {
        const useCase = container.resolve(RemovePluginUseCase);
        const plugin = await useCase.execute(name);
        messages.success(t('cli:commands.plugin.remove.success', { name: plugin.name }));
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.plugin.remove.failed'), err);
        process.exitCode = 1;
      }
    });
}
