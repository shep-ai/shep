/**
 * Plugin Add Command
 *
 * Install a plugin from the curated catalog or with custom configuration.
 *
 * Usage:
 *   shep plugin add mempalace                          # Install from catalog
 *   shep plugin add --name my-tool --type mcp --command "npx my-mcp" --transport stdio  # Custom
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { AddPluginUseCase } from '@/application/use-cases/plugins/add-plugin.use-case.js';
import { PluginType, PluginTransport } from '@/domain/generated/output.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

const PLUGIN_TYPE_MAP: Record<string, PluginType> = {
  mcp: PluginType.Mcp,
  hook: PluginType.Hook,
  cli: PluginType.Cli,
};

const TRANSPORT_MAP: Record<string, PluginTransport> = {
  stdio: PluginTransport.Stdio,
  http: PluginTransport.Http,
};

interface AddOptions {
  name?: string;
  type?: string;
  command?: string;
  transport?: string;
}

export function createAddCommand(): Command {
  const t = getCliI18n().t;
  return new Command('add')
    .description(t('cli:commands.plugin.add.description'))
    .argument('[catalogName]', t('cli:commands.plugin.add.nameArg'))
    .option('--name <name>', t('cli:commands.plugin.add.nameOption'))
    .option('--type <type>', t('cli:commands.plugin.add.typeOption'))
    .option('--command <command>', t('cli:commands.plugin.add.commandOption'))
    .option('--transport <transport>', t('cli:commands.plugin.add.transportOption'))
    .action(async (catalogName: string | undefined, options: AddOptions) => {
      try {
        const useCase = container.resolve(AddPluginUseCase);

        if (catalogName) {
          // Catalog-based install
          const plugin = await useCase.execute(catalogName);
          messages.success(t('cli:commands.plugin.add.success', { name: plugin.name }));
        } else {
          // Custom plugin install
          if (!options.name) {
            messages.error(t('cli:commands.plugin.add.customRequiresName'));
            process.exitCode = 1;
            return;
          }
          if (!options.type) {
            messages.error(t('cli:commands.plugin.add.customRequiresType'));
            process.exitCode = 1;
            return;
          }

          const pluginType = PLUGIN_TYPE_MAP[options.type.toLowerCase()];
          if (!pluginType) {
            messages.error(t('cli:commands.plugin.add.invalidType', { type: options.type }));
            process.exitCode = 1;
            return;
          }

          const plugin = await useCase.execute({
            name: options.name,
            type: pluginType,
            ...(options.command && { serverCommand: options.command }),
            ...(options.transport && { transport: TRANSPORT_MAP[options.transport.toLowerCase()] }),
          });
          messages.success(t('cli:commands.plugin.add.success', { name: plugin.name }));
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.plugin.add.failed'), err);
        process.exitCode = 1;
      }
    });
}
