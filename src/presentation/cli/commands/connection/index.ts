/**
 * Connection Command Group (spec 122)
 *
 * Tracker accounts shep syncs with. Sync rules live under `shep sync`.
 *
 * Usage:
 *   shep connection add <linear|jira> --name <name> [--space] [--site --email] [--secret-env]
 *   shep connection ls
 *   shep connection test <connection>
 *   shep connection rm <connection>
 */

import { Command } from 'commander';
import { getCliI18n } from '../../i18n.js';
import { createAddCommand } from './add.command.js';
import { createLsCommand, createRmCommand, createTestCommand } from './manage.command.js';

export function createConnectionCommand(): Command {
  return new Command('connection')
    .description(getCliI18n().t('cli:commands.connection.description'))
    .addCommand(createAddCommand())
    .addCommand(createLsCommand())
    .addCommand(createTestCommand())
    .addCommand(createRmCommand());
}
