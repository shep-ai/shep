/**
 * Agent Logs Command
 *
 * View log output for an agent run with efficient streaming.
 *
 * Usage:
 *   shep agent logs <id>         # Print full log
 *   shep agent logs -f <id>      # Follow (tail -f) using fs.watch
 *   shep agent logs -n 50 <id>   # Last 50 lines
 */

import { Command } from 'commander';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { messages } from '../../ui/index.js';
import { resolveAgentRun } from './resolve-run.js';
import { viewLog } from '../log-viewer.js';
import { getCliI18n } from '../../i18n.js';

export function createLogsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('logs')
    .description(t('cli:commands.agent.logs.description'))
    .argument('<id>', t('cli:commands.agent.logs.idArgument'))
    .option('-f, --follow', t('cli:commands.agent.logs.followOption'))
    .option('-n, --lines <count>', t('cli:commands.agent.logs.linesOption'), '0')
    .addHelpText(
      'after',
      `
Examples:
  $ shep agent logs a1b2c3d4    View full log
  $ shep agent logs -f abc123    Follow live output
  $ shep agent logs -n 50 abc123 Last 50 lines`
    )
    .action(async (id: string, opts: { follow?: boolean; lines: string }) => {
      try {
        const resolved = await resolveAgentRun(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }

        const logPath = join(homedir(), '.shep', 'logs', `worker-${resolved.run.id}.log`);
        const ok = await viewLog({
          logPath,
          follow: opts.follow,
          lines: parseInt(opts.lines, 10),
          label: `run ${resolved.run.id.substring(0, 8)}`,
        });

        if (!ok) {
          process.exitCode = 1;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.agent.logs.failedToRead'), err);
        process.exitCode = 1;
      }
    });
}