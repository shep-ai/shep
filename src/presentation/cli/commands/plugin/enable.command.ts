/**
 * Plugin Enable Command
 *
 * Enable a plugin for global use in features.
 *
 * Usage:
 *   shep plugin enable mempalace
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { EnablePluginUseCase } from '@/application/use-cases/plugins/enable-plugin.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function createEnableCommand(): Command {
  const t = getCliI18n().t;
  return new Command('enable')
    .description(t('cli:commands.plugin.enable.description'))
    .argument('<name>', t('cli:commands.plugin.enable.nameArg'))
    .action(async (name: string) => {
      try {
        const useCase = container.resolve(EnablePluginUseCase);
        const plugin = await useCase.execute(name);
        messages.success(t('cli:commands.plugin.enable.success', { name: plugin.name }));
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.plugin.enable.failed'), err);
        process.exitCode = 1;
      }
    });
}
