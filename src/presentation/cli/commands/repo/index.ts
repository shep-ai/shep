/**
 * Repo Command
 *
 * Top-level repo command with subcommands for managing tracked repositories.
 *
 * Usage:
 *   shep repo [subcommand]
 *
 * Subcommands:
 *   shep repo ls                      List tracked repositories
 *   shep repo show <id>               Display details of a tracked repository
 *   shep repo add                     Import a GitHub repository
 *   shep repo init-remote [name]      Create a GitHub repo and configure the remote
 */

import { Command } from 'commander';
import { createShowCommand } from './show.command.js';
import { createLsCommand } from './ls.command.js';
import { createAddCommand } from './add.command.js';
import { createInitRemoteCommand } from './init-remote.command.js';
import { getCliI18n } from '../../i18n.js';

/**
 * Create the repo command with all subcommands
 */
export function createRepoCommand(): Command {
  const t = getCliI18n().t;
  const repo = new Command('repo')
    .description(t('cli:commands.repo.description'))
    .addCommand(createLsCommand())
    .addCommand(createShowCommand())
    .addCommand(createAddCommand())
    .addCommand(createInitRemoteCommand());

  return repo;
}
