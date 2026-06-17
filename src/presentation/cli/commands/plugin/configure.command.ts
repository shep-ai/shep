/**
 * Plugin Configure Command
 *
 * Configure plugin settings such as active tool groups.
 *
 * Usage:
 *   shep plugin configure ruflo --tool-groups implement,test
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ConfigurePluginUseCase } from '@/application/use-cases/plugins/configure-plugin.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function createConfigureCommand(): Command {
  const t = getCliI18n().t;
  return new Command('configure')
    .description(t('cli:commands.plugin.configure.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep plugin configure ruflo --tool-groups implement,test   Limit ruflo to the implement + test tool groups`
    )
    .argument('<name>', t('cli:commands.plugin.configure.nameArg'))
    .option('--tool-groups <groups>', t('cli:commands.plugin.configure.toolGroupsOption'))
    .action(async (name: string, options: { toolGroups?: string }) => {
      try {
        if (!options.toolGroups) {
          messages.info(t('cli:commands.plugin.configure.noOptions'));
          return;
        }

        const activeToolGroups = options.toolGroups.split(',').map((g) => g.trim());
        const useCase = container.resolve(ConfigurePluginUseCase);
        const plugin = await useCase.execute(name, { activeToolGroups });
        messages.success(t('cli:commands.plugin.configure.success', { name: plugin.name }));
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.plugin.configure.failed'), err);
        process.exitCode = 1;
      }
    });
}
