/**
 * Plugin Command Group
 *
 * Provides subcommands for managing AI tool plugins.
 *
 * Usage:
 *   shep plugin add <name>         # Install a plugin from catalog
 *   shep plugin add --name X ...   # Install a custom plugin
 *   shep plugin remove <name>      # Remove a plugin
 *   shep plugin list               # List installed plugins
 *   shep plugin enable <name>      # Enable a plugin globally
 *   shep plugin disable <name>     # Disable a plugin globally
 *   shep plugin configure <name>   # Configure plugin settings
 *   shep plugin status [name]      # Show health status
 *   shep plugin catalog            # Browse available plugins
 */

import { Command } from 'commander';
import { createAddCommand } from './add.command.js';
import { createRemoveCommand } from './remove.command.js';
import { createListCommand } from './list.command.js';
import { createEnableCommand } from './enable.command.js';
import { createDisableCommand } from './disable.command.js';
import { createConfigureCommand } from './configure.command.js';
import { createStatusCommand } from './status.command.js';
import { createCatalogCommand } from './catalog.command.js';
import { getCliI18n } from '../../i18n.js';

/**
 * Create the plugin command group
 */
export function createPluginCommand(): Command {
  return new Command('plugin')
    .description(getCliI18n().t('cli:commands.plugin.description'))
    .addCommand(createAddCommand())
    .addCommand(createRemoveCommand())
    .addCommand(createListCommand())
    .addCommand(createEnableCommand())
    .addCommand(createDisableCommand())
    .addCommand(createConfigureCommand())
    .addCommand(createStatusCommand())
    .addCommand(createCatalogCommand());
}
