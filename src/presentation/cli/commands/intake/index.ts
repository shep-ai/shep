import { Command } from 'commander';
import { createLsCommand } from './ls.command.js';
import { createAcceptCommand } from './accept.command.js';
import { createDeclineCommand } from './decline.command.js';

export function createIntakeCommand(): Command {
  return new Command('intake')
    .description('Manage intake triage items')
    .addCommand(createLsCommand())
    .addCommand(createAcceptCommand())
    .addCommand(createDeclineCommand());
}
