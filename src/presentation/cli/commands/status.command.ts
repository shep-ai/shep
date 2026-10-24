/**
 * status Command
 *
 * Displays live status and metrics for the running Shep web UI daemon.
 *
 * Metrics collected:
 *   - PID, port, URL (from daemon.json)
 *   - Uptime (computed from startedAt)
 *   - CPU%, RSS memory (SampleProcessStatsUseCase, the probe `shep ps` uses)
 *   - Readiness, by calling the daemon's own health endpoint through
 *     CheckDaemonHealthUseCase. daemon.json plus `ps` only prove a process
 *     exists; they say nothing about whether it can serve a request, which
 *     is the difference between "up" and "working".
 *   - Environment: paths, versions, OS and git SHA
 *
 * Flags:
 *   --logs [N]   Show last N lines of daemon.log (default 50)
 *   -f, --follow  Follow daemon.log in real-time (like tail -f)
 *
 * Gracefully degrades when CPU and memory are unavailable (Windows, timeout).
 *
 * Usage: shep status
 *        shep status --logs
 *        shep status --logs 100 --follow
 */

import { Command } from 'commander';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { watch } from 'node:fs';
import { container } from '@/infrastructure/di/container.js';
import type { IDaemonService } from '@/application/ports/output/services/daemon-service.interface.js';
import type { IVersionService } from '@/application/ports/output/services/version-service.interface.js';
import { CheckDaemonHealthUseCase } from '@/application/use-cases/daemon/check-daemon-health.use-case.js';
import { SampleProcessStatsUseCase } from '@/application/use-cases/processes/sample-process-stats.use-case.js';
import { GIT_SHA_UNAVAILABLE } from '@/domain/value-objects/build-identity.js';
import {
  getShepHomeDir,
  getShepDbPath,
  getDaemonStatePath,
  getDaemonLogPath,
} from '@/infrastructure/services/filesystem/shep-directory.service.js';
import { renderDetailView, messages, colors } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

const DEFAULT_LOG_LINES = 50;

/** Rendered when a metric could not be collected. */
const UNAVAILABLE_VALUE = 'unavailable';
/** Rendered when a value could not be determined at all. */
const UNKNOWN_VALUE = 'unknown';

interface ProcessMetrics {
  cpu: string;
  rssMb: string;
}

const BYTES_PER_MB = 1024 * 1024;
const METRIC_DECIMALS = 1;

/**
 * Human-readable uptime string, e.g. "2h 14m 3s".
 */
function humanizeUptime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * CPU% and RSS of the daemon, through the same stats probe as `shep ps`
 * (spec 144). "unavailable" when the OS gives no numbers (Windows, timeout).
 */
async function fetchProcessMetrics(pid: number): Promise<ProcessMetrics> {
  const stats = await container.resolve(SampleProcessStatsUseCase).execute(pid);
  if (!stats) return { cpu: UNAVAILABLE_VALUE, rssMb: UNAVAILABLE_VALUE };
  return {
    cpu: stats.cpuPercent.toFixed(METRIC_DECIMALS),
    rssMb: (stats.rssBytes / BYTES_PER_MB).toFixed(METRIC_DECIMALS),
  };
}

/**
 * Read the last N lines of a file.
 */
async function tailFile(filePath: string, lineCount: number): Promise<string[]> {
  const lines: string[] = [];
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    lines.push(line);
    if (lines.length > lineCount) {
      lines.shift();
    }
  }

  return lines;
}

/**
 * Follow a file in real-time (like tail -f).
 * Reads new content as the file grows.
 */
function followFile(filePath: string): void {
  let position = 0;
  try {
    position = statSync(filePath).size;
  } catch {
    // File doesn't exist yet, start from 0
  }

  const readNewContent = () => {
    try {
      const currentSize = statSync(filePath).size;
      if (currentSize <= position) {
        if (currentSize < position) position = 0; // File was truncated
        return;
      }

      const stream = createReadStream(filePath, {
        encoding: 'utf-8',
        start: position,
      });

      let buffer = '';
      stream.on('data', (chunk: string) => {
        buffer += chunk;
      });
      stream.on('end', () => {
        position = currentSize;
        if (buffer) {
          process.stdout.write(buffer);
        }
      });
    } catch {
      // File may have been deleted/rotated
    }
  };

  const watcher = watch(filePath, () => {
    readNewContent();
  });

  // Also poll every 1s as a fallback (fs.watch can miss events)
  const interval = setInterval(readNewContent, 1000);

  process.on('SIGINT', () => {
    watcher.close();
    clearInterval(interval);
    process.exit(0);
  });
}

/**
 * Create the status command.
 */
export function createStatusCommand(): Command {
  const t = getCliI18n().t;
  return new Command('status')
    .description(t('cli:commands.status.description'))
    .option('--logs [lines]', t('cli:commands.status.logsOption'))
    .option('-f, --follow', t('cli:commands.status.followOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep status                 Show daemon status and resource usage
  $ shep status --logs          Print the last 50 daemon log lines
  $ shep status --logs 100      Print the last 100 daemon log lines
  $ shep status --logs --follow Follow daemon logs in real time`
    )
    .action(async (options: { logs?: string | true; follow?: boolean }) => {
      const logPath = getDaemonLogPath();

      // Handle --logs flag
      if (options.logs !== undefined || options.follow) {
        if (!existsSync(logPath)) {
          messages.newline();
          messages.info(t('cli:commands.status.noLogFile'));
          messages.info(t('cli:commands.status.expectedAt', { path: logPath }));
          messages.newline();
          return;
        }

        // Show tail lines
        const lineCount =
          typeof options.logs === 'string'
            ? parseInt(options.logs, 10) || DEFAULT_LOG_LINES
            : DEFAULT_LOG_LINES;

        const lines = await tailFile(logPath, lineCount);
        if (lines.length > 0) {
          console.log(lines.join('\n'));
        } else {
          messages.info(t('cli:commands.status.logEmpty'));
        }

        // Follow mode
        if (options.follow) {
          console.log(colors.muted(t('cli:commands.status.followHint')));
          followFile(logPath);
          return; // Block forever (followFile handles SIGINT)
        }

        return;
      }

      const daemonService = container.resolve<IDaemonService>('IDaemonService');

      const state = await daemonService.read();

      if (!state || !daemonService.isAlive(state.pid)) {
        messages.newline();
        messages.info(t('cli:commands.status.notRunning'));
        messages.info(t('cli:commands.status.startHint'));
        messages.newline();
        return;
      }

      const { pid, port, startedAt } = state;
      const url = `http://localhost:${port}`;
      const uptimeMs = Date.now() - Date.parse(startedAt);
      const uptime = humanizeUptime(uptimeMs);

      const { cpu, rssMb } = await fetchProcessMetrics(pid);

      // Get CLI version + build identity (OS, git SHA)
      let cliVersion = UNKNOWN_VALUE;
      let osDescription = UNKNOWN_VALUE;
      let gitSha = GIT_SHA_UNAVAILABLE;
      try {
        const versionService = container.resolve<IVersionService>('IVersionService');
        cliVersion = versionService.getVersion().version;
        const identity = versionService.getBuildIdentity();
        osDescription = `${identity.platform} ${identity.osRelease} ${identity.arch}`;
        gitSha = identity.gitSha ?? GIT_SHA_UNAVAILABLE;
      } catch {
        // Version service not available — the rest of the status still renders.
      }

      // Ask the daemon whether it is actually ready, not just alive.
      let readiness = UNAVAILABLE_VALUE;
      try {
        readiness = (await container.resolve(CheckDaemonHealthUseCase).execute()).summary;
      } catch {
        // A probe failure must not cost the user the rest of the report.
      }

      renderDetailView({
        title: t('cli:commands.status.title'),
        sections: [
          {
            fields: [
              { label: t('cli:commands.status.pidLabel'), value: String(pid) },
              { label: t('cli:commands.status.portLabel'), value: String(port) },
              { label: t('cli:commands.status.urlLabel'), value: url },
              {
                label: t('cli:commands.status.startedLabel'),
                value: new Date(startedAt).toLocaleString(),
              },
              { label: t('cli:commands.status.uptimeLabel'), value: uptime },
              {
                label: t('cli:commands.status.cpuLabel'),
                value: cpu === UNAVAILABLE_VALUE ? UNAVAILABLE_VALUE : `${cpu}%`,
              },
              {
                label: t('cli:commands.status.memoryLabel'),
                value: rssMb === UNAVAILABLE_VALUE ? UNAVAILABLE_VALUE : `${rssMb} MB`,
              },
              { label: t('cli:commands.status.healthLabel'), value: readiness },
            ],
          },
          {
            title: t('cli:commands.status.envTitle'),
            fields: [
              { label: t('cli:commands.status.shepHomeLabel'), value: getShepHomeDir() },
              { label: t('cli:commands.status.cliVersionLabel'), value: cliVersion },
              { label: t('cli:commands.status.nodeVersionLabel'), value: process.version },
              { label: t('cli:commands.status.osLabel'), value: osDescription },
              { label: t('cli:commands.status.gitShaLabel'), value: gitSha },
              { label: t('cli:commands.status.dbPathLabel'), value: getShepDbPath() },
              { label: t('cli:commands.status.logFileLabel'), value: logPath },
              { label: t('cli:commands.status.daemonConfigLabel'), value: getDaemonStatePath() },
            ],
          },
        ],
      });
    });
}
