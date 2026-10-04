/**
 * Space Command Group (spec 120)
 *
 * Spaces keep bodies of work apart (personal vs work, one client vs another);
 * memory shared inside a space never reaches another. Product lines group
 * repositories inside a space.
 *
 * Usage:
 *   shep space ls                              # Spaces, lines, repos, memory
 *   shep space show [path]                     # Where a repository lands, and why
 *   shep space new <name> [--default]          # Create a space
 *   shep space edit <space> [--name ...]       # Rename / describe / recolour
 *   shep space rm <space>                      # Delete a space
 *   shep space default <space>                 # Space for unmatched repositories
 *   shep space line new|rm <space> <line>      # Product lines
 *   shep space rule add|ls|rm                  # Path and git-remote rules
 *   shep space assign <space> [path]           # Pin a repository
 *   shep space unassign [path]                 # Remove a pin
 */

import { Command } from 'commander';
import { getCliI18n } from '../../i18n.js';
import { createLsCommand } from './ls.command.js';
import { createShowCommand } from './show.command.js';
import { createNewCommand } from './new.command.js';
import { createEditCommand } from './edit.command.js';
import { createRmCommand } from './rm.command.js';
import { createDefaultCommand } from './default.command.js';
import { createLineCommand } from './line.command.js';
import { createRuleCommand } from './rule.command.js';
import { createAssignCommand, createUnassignCommand } from './assign.command.js';

export function createSpaceCommand(): Command {
  return new Command('space')
    .description(getCliI18n().t('cli:commands.space.description'))
    .addCommand(createLsCommand())
    .addCommand(createShowCommand())
    .addCommand(createNewCommand())
    .addCommand(createEditCommand())
    .addCommand(createRmCommand())
    .addCommand(createDefaultCommand())
    .addCommand(createLineCommand())
    .addCommand(createRuleCommand())
    .addCommand(createAssignCommand())
    .addCommand(createUnassignCommand());
}
