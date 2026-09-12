/**
 * Feature Logs Command
 *
 * View log output for a feature's agent run with efficient streaming.
 * Resolves the feature by ID, finds its associated agent run, then
 * displays the worker log file.
 *
 * Usage:
 *   shep feat logs <id>         # Print full log
 *   shep feat logs -f <id>      # Follow (tail -f) using fs.watch
 *   shep feat logs -n 50 <id>   # Last 50 lines
 */

import { Command } from 'commander';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { container } from '@/infrastructure/di/container.js';
import { ShowFeatureUseCase } from '@/application/use-cases/features/show-feature.use-case.js';
import { messages } from '../../ui/index.js';
import { viewLog } from '../log-viewer.js';
import { getCliI18n } from '../../i18n.js';

export function createLogsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('logs')
    .description(t('cli:commands.feat.logs.description'))
    .argument('<id>', t('cli:commands.feat.logs.idArgument'))
    .option('-f, --follow', t('cli:commands.feat.logs.followOption'))
    .option('-n, --lines <count>', t('cli:commands.feat.logs.linesOption'), '0')
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat logs abc12345
  $ shep feat logs -f abc12345
  $ shep feat logs -n 50 abc12345`
    )
    .action(async (id: string, opts: { follow?: boolean; lines: string }) => {
      try {
        const useCase = container.resolve(ShowFeatureUseCase);
        const feature = await useCase.execute(id);

        if (!feature.agentRunId) {
          messages.error(t('cli:commands.feat.logs.noAgentRun', { name: feature.name }));
          process.exitCode = 1;
          return;
        }

        const logPath = join(homedir(), '.shep', 'logs', `worker-${feature.agentRunId}.log`);
        const ok = await viewLog({
          logPath,
          follow: opts.follow,
          lines: parseInt(opts.lines, 10),
          label: `feature "${feature.name}"`,
        });

        if (!ok) {
          process.exitCode = 1;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.logs.failedToRead'), err);
        process.exitCode = 1;
      }
    });
}
