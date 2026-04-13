/**
 * `shep app cloud-providers` command group.
 *
 * Thin Commander wrapper around cloud-deploy use cases — zero logic
 * duplication with the Web UI. Each subcommand resolves the same use
 * case the corresponding API route calls.
 */

import { Command } from 'commander';
import { createCloudProvidersLsCommand } from './ls.command.js';
import { createCloudProvidersConnectCommand } from './connect.command.js';
import { createGithubLoginCommand } from './github-login.command.js';

export function createCloudProvidersCommand(): Command {
  return new Command('cloud-providers')
    .description('Manage cloud deployment providers for applications')
    .addCommand(createCloudProvidersLsCommand())
    .addCommand(createCloudProvidersConnectCommand())
    .addCommand(createGithubLoginCommand());
}
