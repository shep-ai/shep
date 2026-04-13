/**
 * `shep app git` command group.
 *
 * Thin wrapper over git-related use cases (currently just
 * create-remote).
 */

import { Command } from 'commander';
import { createGitCreateRemoteCommand } from './create-remote.command.js';

export function createAppGitCommand(): Command {
  return new Command('git')
    .description('Git operations for an application')
    .addCommand(createGitCreateRemoteCommand());
}
