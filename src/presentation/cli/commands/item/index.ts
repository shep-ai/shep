/**
 * Item Command
 *
 * Top-level item command with subcommands for managing work items.
 *
 * Usage:
 *   shep item [subcommand]
 *
 * Subcommands:
 *   shep item ls <project>                    List work items in a project
 *   shep item new <project>                   Create a new work item
 *   shep item relate <source> <target>        Create a relation between work items
 */

import { Command } from 'commander';
import { createLsCommand } from './ls.command.js';
import { createNewCommand } from './new.command.js';
import { createRelateCommand } from './relate.command.js';
import { createExportCommand } from './export.command.js';

export function createItemCommand(): Command {
  return new Command('item')
    .description('Manage work items')
    .addCommand(createLsCommand())
    .addCommand(createNewCommand())
    .addCommand(createRelateCommand())
    .addCommand(createExportCommand());
}
