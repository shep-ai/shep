import { Command } from 'commander';
import { createInitCommand } from './init.command.js';

export function createCoastsCommand(): Command {
  return new Command('coasts')
    .description('Manage Coasts containerized runtime')
    .addCommand(createInitCommand());
}
