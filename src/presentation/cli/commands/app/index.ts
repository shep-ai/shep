/**
 * App Command
 *
 * Top-level app command with subcommands for managing applications.
 *
 * Usage:
 *   shep app [subcommand]
 *
 * Subcommands:
 *   shep app ls                                List applications
 *   shep app show <id>                         Display details of an application
 *   shep app new <desc>                        Create a new application
 *   shep app del <id>                          Delete an application
 *   shep app cloud-providers ls                List cloud deployment providers
 *   shep app cloud-providers connect <id>      Connect a cloud provider token
 *   shep app cloud-providers github-login      Authenticate with GitHub CLI
 *   shep app deploy start <id>                 Start a cloud deployment
 *   shep app deploy status <id>                Show current cloud deployment status
 *   shep app git create-remote <id>            Create and push a GitHub repo for the app
 */

import { Command } from 'commander';
import { createLsCommand } from './ls.command.js';
import { createShowCommand } from './show.command.js';
import { createNewCommand } from './new.command.js';
import { createDelCommand } from './del.command.js';
import { createCloudProvidersCommand } from './cloud-providers/index.js';
import { createDeployCommand } from './deploy/index.js';
import { createAppGitCommand } from './git/index.js';
import { getCliI18n } from '../../i18n.js';

/**
 * Create the app command with all subcommands
 */
export function createAppCommand(): Command {
  const t = getCliI18n().t;
  const app = new Command('app')
    .description(t('cli:commands.app.description'))
    .addCommand(createLsCommand())
    .addCommand(createShowCommand())
    .addCommand(createNewCommand())
    .addCommand(createDelCommand())
    .addCommand(createCloudProvidersCommand())
    .addCommand(createDeployCommand())
    .addCommand(createAppGitCommand());

  return app;
}
