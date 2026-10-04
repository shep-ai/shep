/**
 * Sync Command Group (spec 122)
 *
 * Sync rules keep a Linear team or a Jira JQL query in a shep project; the
 * daemon runs them on their interval, `shep sync run` runs them now.
 *
 * Usage:
 *   shep sync rule add <connection> --project <p> --scope <s> [--two-way] [--every <min>]
 *   shep sync rule ls [connection]
 *   shep sync rule enable|disable|rm <rule>
 *   shep sync run [rule]
 */

import { Command } from 'commander';
import { getCliI18n } from '../../i18n.js';
import { createRuleCommand } from './rule.command.js';
import { createRunCommand } from './run.command.js';

export function createSyncCommand(): Command {
  return new Command('sync')
    .description(getCliI18n().t('cli:commands.sync.description'))
    .addCommand(createRuleCommand())
    .addCommand(createRunCommand());
}
