import { Command } from 'commander';
import { createLsCommand } from './ls.command.js';

export function createNotificationsCommand(): Command {
  return new Command('notifications')
    .alias('notif')
    .description('Manage notifications')
    .addCommand(createLsCommand());
}
