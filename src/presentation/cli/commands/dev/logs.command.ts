/**
 * `shep dev logs`
 *
 * Print a dev server's captured output, optionally following it live. Reuses
 * the shared streaming loop, so following here behaves exactly as it does
 * during `shep dev start` — the same lines from the same use case.
 *
 * Unlike `start`, following ends with a zero exit status when the deployment
 * goes away: a server that stopped is not a failure of the logs command.
 */

import { Command } from 'commander';

import { getCliI18n } from '../../i18n.js';
import { messages } from '../../ui/index.js';
import {
  ALL_LINES,
  DevStreamOutcome,
  flushOutput,
  followDeployment,
  printDeploymentLogs,
} from './stream.js';
import { resolveDevTarget, withTargetOptions, type DevTargetOptions } from './target.js';

interface DevLogsOptions extends DevTargetOptions {
  follow?: boolean;
  lines?: string;
}

/** Parse `--lines`; anything unusable falls back to "show everything". */
function parseLines(raw: string | undefined): number {
  if (raw === undefined) return ALL_LINES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : ALL_LINES;
}

export function createDevLogsCommand(): Command {
  const t = getCliI18n().t;

  return withTargetOptions(new Command('logs').description(t('cli:commands.dev.logs.description')))
    .option('-F, --follow', t('cli:commands.dev.logs.followOption'))
    .option('-n, --lines <count>', t('cli:commands.dev.logs.linesOption'))
    .action(async (options: DevLogsOptions) => {
      const resolved = await resolveDevTarget(options);
      if ('error' in resolved) {
        messages.error(resolved.error);
        process.exitCode = 1;
        return;
      }
      const { target } = resolved;
      const tail = parseLines(options.lines);

      if (!options.follow) {
        const tracked = printDeploymentLogs(target.targetId, tail);
        if (!tracked) {
          messages.info(t('cli:commands.dev.logs.noLogs', { path: target.repoPath }));
        }
        return;
      }

      const result = await followDeployment({
        targetId: target.targetId,
        tail,
        showStates: false,
        stopWhenReady: false,
      });

      switch (result.outcome) {
        case DevStreamOutcome.Untracked:
          messages.info(t('cli:commands.dev.logs.noLogs', { path: target.repoPath }));
          break;
        case DevStreamOutcome.Interrupted:
          messages.info(t('cli:commands.dev.logs.detached'));
          break;
        default:
          messages.info(t('cli:commands.dev.logs.ended'));
      }

      await flushOutput();
      process.exit(process.exitCode ?? 0);
    });
}
