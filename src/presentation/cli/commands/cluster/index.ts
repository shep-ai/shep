/**
 * Cluster Command
 *
 * Top-level cluster command with subcommands for managing clusters.
 *
 * Usage:
 *   shep cluster [subcommand]
 *
 * Subcommands:
 *   shep cluster new <name>              Create a new cluster
 *   shep cluster ls                      List clusters
 *   shep cluster show <id-or-slug>       Display cluster details
 *   shep cluster del <id-or-slug>        Delete a cluster
 *   shep cluster link <cluster> <entity> Link a repo or app to a cluster
 *   shep cluster unlink <cluster> <entity> Unlink a repo or app from a cluster
 *   shep cluster status <id-or-slug>     Show live cluster status
 */

import { Command } from 'commander';
import { createNewCommand } from './new.command.js';
import { createLsCommand } from './ls.command.js';
import { createShowCommand } from './show.command.js';
import { createDelCommand } from './del.command.js';
import { createLinkCommand } from './link.command.js';
import { createUnlinkCommand } from './unlink.command.js';
import { createStatusCommand } from './status.command.js';
import { getCliI18n } from '../../i18n.js';

/**
 * Create the cluster command with all subcommands
 */
export function createClusterCommand(): Command {
  const t = getCliI18n().t;
  const cluster = new Command('cluster')
    .description(t('cli:commands.cluster.description'))
    .addCommand(createNewCommand())
    .addCommand(createLsCommand())
    .addCommand(createShowCommand())
    .addCommand(createDelCommand())
    .addCommand(createLinkCommand())
    .addCommand(createUnlinkCommand())
    .addCommand(createStatusCommand());

  return cluster;
}
