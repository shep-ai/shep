/**
 * Workflow Command
 *
 * Top-level workflow command with subcommands for managing scheduled workflows.
 *
 * Usage:
 *   shep workflow [subcommand]
 *
 * Subcommands:
 *   shep workflow create <name>     Create a new workflow
 *   shep workflow list               List all workflows
 *   shep workflow show <name>       Show workflow details
 *   shep workflow run <name>        Manually trigger a workflow
 *   shep workflow schedule <name>   Set a cron schedule
 *   shep workflow enable <name>     Enable a workflow's schedule
 *   shep workflow disable <name>    Disable a workflow's schedule
 *   shep workflow history <name>    View execution history
 *   shep workflow update <name>     Update a workflow
 *   shep workflow delete <name>     Delete a workflow
 */

import { Command } from 'commander';
import { createCreateCommand } from './create.command.js';
import { createListCommand } from './list.command.js';
import { createShowCommand } from './show.command.js';
import { createRunCommand } from './run.command.js';
import { createScheduleCommand } from './schedule.command.js';
import { createEnableCommand } from './enable.command.js';
import { createDisableCommand } from './disable.command.js';
import { createHistoryCommand } from './history.command.js';
import { createUpdateCommand } from './update.command.js';
import { createDeleteCommand } from './delete.command.js';

/**
 * Create the workflow command with all subcommands.
 */
export function createWorkflowCommand(): Command {
  return new Command('workflow')
    .description('Manage scheduled workflows')
    .addCommand(createCreateCommand())
    .addCommand(createListCommand())
    .addCommand(createShowCommand())
    .addCommand(createRunCommand())
    .addCommand(createScheduleCommand())
    .addCommand(createEnableCommand())
    .addCommand(createDisableCommand())
    .addCommand(createHistoryCommand())
    .addCommand(createUpdateCommand())
    .addCommand(createDeleteCommand());
}
