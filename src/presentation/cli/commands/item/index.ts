/**
 * Item Command
 *
 * Top-level item command with subcommands for managing work items.
 *
 * Usage:
 *   shep item [subcommand]
 *
 * Subcommands:
 *   shep item ls <project>        List work items in a project
 *   shep item new <project>       Create a new work item
 */

import { Command } from 'commander';
import { createLsCommand } from './ls.command.js';
import { createNewCommand } from './new.command.js';

export function createItemCommand(): Command {
  return new Command('item')
    .description('Manage work items')
    .addCommand(createLsCommand())
    .addCommand(createNewCommand());
}
