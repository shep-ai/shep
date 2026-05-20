/**
 * status Command
 *
 * Displays live status and metrics for the running Shep web UI daemon.
 *
 * Metrics collected:
 *   - PID, port, URL (from daemon.json)
 *   - Uptime (computed from startedAt)
 *   - CPU%, RSS memory (from ps shell-out via execFile — injection-safe)
 *   - Environment: paths, versions
 *
 * Flags:
 *   --logs [N]   Show last N lines of daemon.log (default 50)
 *   -f, --follow  Follow daemon.log in real-time (like tail -f)
 *
 * Gracefully degrades if ps is unavailable (timeout or error).
 *
 * Usage: shep status
 *        shep status --logs
 *        shep status --logs 100 --follow
 */

import { Command } from 'commander';
import { execFile } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { watch } from 'node:fs';
import { container } from '@/infrastructure/di/container.js';
import type { IDaemonService } from '@/application/ports/output/services/daemon-service.interface.js';
import type { IVersionService } from '@/application/ports/output/services/version-service.interface.js';
import {
  getShepHomeDir,
  getShepDbPath,
  getDaemonStatePath,
  getDaemonLogPath,
} from '@/infrastructure/services/filesystem/shep-directory.service.js';
import { renderDetailView, messages, colors } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

const PS_TIMEOUT_MS = 2000;
const DEFAULT_LOG_LINES = 50;

interface PsMetrics {
  cpu: string;
  rssMb: string;
}

/**
 * Parse ps output: "pid  cpu%  rss_kb\n"
 * Returns formatted strings for display.
 */
function parsePs(output: string): PsMetrics {
  const parts = output.trim().split(/\s+/);
  const cpu = parts[1] ?? '?';
  const rssKb = parseFloat(parts[2] ?? '0');
  const rssMb = (rssKb / 1024).toFixed(1);
  return { cpu, rssMb };
}

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
 * Shell out to ps for CPU% and RSS, with a timeout guard.
 * Uses execFile (not exec) — the PID is a separate array argument,
 * preventing any possibility of shell injection.
 */
function fetchPsMetrics(pid: number): Promise<PsMetrics> {
  return new Promise((resolve) => {
    const pidStr = String(pid);
    let settled = false;

    const fallback = (): PsMetrics => ({ cpu: 'unavailable', rssMb: 'unavailable' });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve(fallback());
      }
    }, PS_TIMEOUT_MS);

    const child = execFile(
      'ps',
      ['-o', 'pid=,pcpu=,rss=', '-p', pidStr],
      { timeout: PS_TIMEOUT_MS },
      (err, stdout) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err || !stdout.trim()) {
          resolve(fallback());
        } else {
          resolve(parsePs(stdout));
        }
      }
    );
  });
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

      const { cpu, rssMb } = await fetchPsMetrics(pid);

      // Get CLI version
      let cliVersion = 'unknown';
      try {
        const versionService = container.resolve<IVersionService>('IVersionService');
        cliVersion = versionService.getVersion().version;
      } catch {
        // Version service not available
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
                value: cpu === 'unavailable' ? 'unavailable' : `${cpu}%`,
              },
              {
                label: t('cli:commands.status.memoryLabel'),
                value: rssMb === 'unavailable' ? 'unavailable' : `${rssMb} MB`,
              },
            ],
          },
          {
            title: t('cli:commands.status.envTitle'),
            fields: [
              { label: t('cli:commands.status.shepHomeLabel'), value: getShepHomeDir() },
              { label: t('cli:commands.status.cliVersionLabel'), value: cliVersion },
              { label: t('cli:commands.status.nodeVersionLabel'), value: process.version },
              { label: t('cli:commands.status.dbPathLabel'), value: getShepDbPath() },
              { label: t('cli:commands.status.logFileLabel'), value: logPath },
              { label: t('cli:commands.status.daemonConfigLabel'), value: getDaemonStatePath() },
            ],
          },
        ],
      });
    });
}
