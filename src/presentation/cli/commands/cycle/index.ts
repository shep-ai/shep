/**
 * Cycle Command
 *
 * Top-level cycle command with subcommands for managing sprint cycles.
 *
 * Usage:
 *   shep cycle [subcommand]
 *
 * Subcommands:
 *   shep cycle ls <project>              List cycles in a project
 *   shep cycle new <project>             Create a new cycle
 *   shep cycle show <cycle-id>           Show cycle details
 *   shep cycle add-items <cycle-id>      Add work items to a cycle
 *   shep cycle transfer <cycle-id>       Transfer incomplete items to another cycle
 */

import { Command } from 'commander';
import { createLsCommand } from './ls.command.js';
import { createNewCommand } from './new.command.js';
import { createShowCommand } from './show.command.js';
import { createAddItemsCommand } from './add-items.command.js';
import { createTransferCommand } from './transfer.command.js';

export function createCycleCommand(): Command {
  return new Command('cycle')
    .description('Manage sprint cycles')
    .addCommand(createLsCommand())
    .addCommand(createNewCommand())
    .addCommand(createShowCommand())
    .addCommand(createAddItemsCommand())
    .addCommand(createTransferCommand());
}
