/**
 * Outcome Command Group (spec 130)
 *
 * What happened after an opportunity shipped: whether the reports behind it
 * stopped, who to tell, and how good the space's estimates were.
 *
 * Usage:
 *   shep outcome ls [--space]
 *   shep outcome check
 *   shep outcome ship <opportunity>
 *   shep outcome tell <opportunity> [--done]
 *   shep outcome hours <opportunity> <hours>
 */

import { Command } from 'commander';
import { getCliI18n } from '../../i18n.js';
import { createCheckCommand, createLsCommand } from './list.command.js';
import { createHoursCommand, createShipCommand, createTellCommand } from './act.command.js';

export function createOutcomeCommand(): Command {
  return new Command('outcome')
    .description(getCliI18n().t('cli:commands.outcome.description'))
    .addCommand(createLsCommand())
    .addCommand(createCheckCommand())
    .addCommand(createShipCommand())
    .addCommand(createTellCommand())
    .addCommand(createHoursCommand());
}
