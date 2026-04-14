/**
 * `shep app deploy` command group.
 *
 * Thin wrapper over the cloud deployment use cases.
 */

import { Command } from 'commander';
import { createDeployInitiateCommand } from './initiate.command.js';
import { createDeployStatusCommand } from './status.command.js';

export function createDeployCommand(): Command {
  return new Command('deploy')
    .description('Cloud deploy an application to a cloud provider')
    .addCommand(createDeployInitiateCommand())
    .addCommand(createDeployStatusCommand());
}
