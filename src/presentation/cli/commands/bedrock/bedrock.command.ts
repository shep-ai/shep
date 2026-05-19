/**
 * `shep bedrock` command group.
 *
 * Thin wrapper exposing the four project-bedrock lifecycle subcommands.
 * Each subcommand resolves its use case from the DI container.
 */

import { Command } from 'commander';
import { createBedrockInitCommand } from './init.command.js';
import { createBedrockSyncCommand } from './sync.command.js';
import { createBedrockDoctorCommand } from './doctor.command.js';
import { createBedrockShipCommand } from './ship.command.js';

export function createBedrockCommand(): Command {
  return new Command('bedrock')
    .description('Manage project-bedrock memory for an application')
    .addCommand(createBedrockInitCommand())
    .addCommand(createBedrockSyncCommand())
    .addCommand(createBedrockDoctorCommand())
    .addCommand(createBedrockShipCommand());
}
