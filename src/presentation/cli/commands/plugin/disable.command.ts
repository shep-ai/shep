/**
 * Plugin Disable Command
 *
 * Disable a plugin from global use in features.
 *
 * Usage:
 *   shep plugin disable mempalace
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { DisablePluginUseCase } from '@/application/use-cases/plugins/disable-plugin.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function createDisableCommand(): Command {
  const t = getCliI18n().t;
  return new Command('disable')
    .description(t('cli:commands.plugin.disable.description'))
    .argument('<name>', t('cli:commands.plugin.disable.nameArg'))
    .action(async (name: string) => {
      try {
        const useCase = container.resolve(DisablePluginUseCase);
        const plugin = await useCase.execute(name);
        messages.success(t('cli:commands.plugin.disable.success', { name: plugin.name }));
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.plugin.disable.failed'), err);
        process.exitCode = 1;
      }
    });
}
