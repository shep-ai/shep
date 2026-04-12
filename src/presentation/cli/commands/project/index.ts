/**
 * Project Command
 *
 * Top-level project command with subcommands for managing PM projects.
 *
 * Usage:
 *   shep project [subcommand]
 *
 * Subcommands:
 *   shep project ls              List all projects
 *   shep project new              Create a new project
 *   shep project show <slug>      Show project details with work items
 *   shep project del <slug>       Delete a project
 */

import { Command } from 'commander';
import { createLsCommand } from './ls.command.js';
import { createNewCommand } from './new.command.js';
import { createShowCommand } from './show.command.js';
import { createDelCommand } from './del.command.js';

export function createProjectCommand(): Command {
  return new Command('project')
    .description('Manage projects')
    .addCommand(createLsCommand())
    .addCommand(createNewCommand())
    .addCommand(createShowCommand())
    .addCommand(createDelCommand());
}
