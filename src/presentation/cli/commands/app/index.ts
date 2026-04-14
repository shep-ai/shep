/**
 * App Command
 *
 * Top-level app command with subcommands for managing applications.
 *
 * Usage:
 *   shep app [subcommand]
 *
 * Subcommands:
 *   shep app ls             List applications
 *   shep app show <id>      Display details of an application
 *   shep app new <desc>     Create a new application
 *   shep app del <id>       Delete an application
 */

import { Command } from 'commander';
import { createLsCommand } from './ls.command.js';
import { createShowCommand } from './show.command.js';
import { createNewCommand } from './new.command.js';
import { createDelCommand } from './del.command.js';
import { getCliI18n } from '../../i18n.js';

/**
 * Create the app command with all subcommands
 */
export function createAppCommand(): Command {
  const t = getCliI18n().t;
  const app = new Command('app')
    .description(t('cli:commands.app.description'))
    .addCommand(createLsCommand())
    .addCommand(createShowCommand())
    .addCommand(createNewCommand())
    .addCommand(createDelCommand());

  return app;
}
