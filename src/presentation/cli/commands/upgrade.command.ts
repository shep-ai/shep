/**
 * Upgrade Command
 *
 * Self-upgrades Shep CLI to the latest published version.
 * Checks current vs latest version before running npm install.
 *
 * Usage: shep upgrade
 */

import { Command } from 'commander';
import { spawn as defaultSpawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { container } from '@/infrastructure/di/container.js';
import type { IVersionService } from '@/application/ports/output/services/version-service.interface.js';
import type { IDaemonService } from '@/application/ports/output/services/daemon-service.interface.js';
import { messages } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';
import { stopDaemon } from './daemon/stop-daemon.js';
import { startDaemon } from './daemon/start-daemon.js';

type SpawnFn = typeof defaultSpawn;

const VERSION_CHECK_TIMEOUT_MS = 10_000;
const NPM_CACHE_ADD_TIMEOUT_MS = 120_000;

/** On Windows, npm is a .cmd batch file — spawn() needs shell: true to resolve it. */
const IS_WINDOWS = process.platform === 'win32';

/**
 * Get the latest published version of @shepai/cli from npm registry.
 * Returns null if the check fails (fail-open).
 */
function getLatestVersion(spawnFn: SpawnFn): Promise<string | null> {
  return new Promise((resolve) => {
    let output = '';
    let settled = false;

    const child: ChildProcess = spawnFn('npm', ['view', '@shepai/cli', 'version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(IS_WINDOWS && { shell: true }),
    });

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        messages.warning(getCliI18n().t('cli:commands.upgrade.versionCheckTimeout'));
        resolve(null);
      }
    }, VERSION_CHECK_TIMEOUT_MS);

    child.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        if (code === 0 && output.trim()) {
          resolve(output.trim());
        } else {
          resolve(null);
        }
      }
    });

    child.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        messages.warning(getCliI18n().t('cli:commands.upgrade.versionCheckFailed'));
        resolve(null);
      }
    });
  });
}

/**
 * Pre-download the package AND all transitive dependencies into npm's cache.
 * Uses `npm install --prefix <tmpdir>` which resolves the full dependency tree
 * and populates the cache. The temp directory is cleaned up afterwards.
 * Returns true if the pre-download succeeded, false otherwise (fail-open).
 */
function preDownloadPackage(spawnFn: SpawnFn): Promise<boolean> {
  let tmpDir: string;
  try {
    tmpDir = mkdtempSync(join(tmpdir(), 'shep-upgrade-'));
  } catch {
    return Promise.resolve(false);
  }

  const cleanup = () => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  };

  return new Promise((resolve) => {
    let settled = false;

    const child: ChildProcess = spawnFn(
      'npm',
      ['install', '--prefix', tmpDir, '--ignore-scripts', '@shepai/cli@latest'],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        ...(IS_WINDOWS && { shell: true }),
      }
    );

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        cleanup();
        resolve(false);
      }
    }, NPM_CACHE_ADD_TIMEOUT_MS);

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        cleanup();
        resolve(code === 0);
      }
    });

    child.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        cleanup();
        resolve(false);
      }
    });
  });
}

/**
 * Run npm i -g @shepai/cli@latest with inherited stdio.
 * Returns the exit code, or rejects on spawn error.
 */
function runNpmInstall(spawnFn: SpawnFn): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawnFn('npm', ['i', '-g', '@shepai/cli@latest', '--prefer-offline'], {
      stdio: 'inherit',
      ...(IS_WINDOWS && { shell: true }),
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Create the upgrade command
 */
export function createUpgradeCommand(spawnFn: SpawnFn = defaultSpawn): Command {
  const t = getCliI18n().t;
  return new Command('upgrade')
    .description(t('cli:commands.upgrade.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep upgrade                  Upgrade Shep to the latest version
  $ shep stop && shep upgrade     Upgrade and restart the daemon automatically
  $ shep upgrade                  No-op when Shep is already up to date`
    )
    .action(async () => {
      try {
        const versionService = container.resolve<IVersionService>('IVersionService');
        const { version: currentVersion } = versionService.getVersion();

        // 1. Check latest version (fail-open with timeout)
        const latestVersion = await getLatestVersion(spawnFn);

        // 2. Compare — exit early if up to date
        if (latestVersion && latestVersion === currentVersion) {
          messages.success(t('cli:commands.upgrade.alreadyUpToDate', { version: currentVersion }));
          return;
        }

        // 3. Show what we're doing
        if (latestVersion) {
          messages.info(
            t('cli:commands.upgrade.upgradingFromTo', {
              current: currentVersion,
              latest: latestVersion,
            })
          );
        } else {
          messages.info(t('cli:commands.upgrade.upgradingToLatest', { current: currentVersion }));
        }

        // 4. Pre-download the package into npm cache BEFORE stopping the daemon.
        //    This minimizes downtime — the actual install will read from cache.
        messages.info(t('cli:commands.upgrade.downloadingPackage'));
        const cached = await preDownloadPackage(spawnFn);
        if (!cached) {
          messages.warning(t('cli:commands.upgrade.downloadFailed'));
        }

        // 5. Check daemon state and stop if running
        const daemonService = container.resolve<IDaemonService>('IDaemonService');
        const daemonState = await daemonService.read();
        const daemonWasRunning = daemonState !== null && daemonService.isAlive(daemonState.pid);
        const previousPort = daemonWasRunning ? daemonState!.port : undefined;

        if (daemonWasRunning) {
          messages.info(t('cli:commands.upgrade.stoppingDaemon'));
          await stopDaemon(daemonService);
        }

        // 6. Run npm i -g @shepai/cli@latest; always restore daemon in finally
        let installExitCode = 1;
        try {
          installExitCode = await runNpmInstall(spawnFn);
        } finally {
          if (daemonWasRunning) {
            messages.info(t('cli:commands.upgrade.restartingDaemon'));
            await startDaemon({ port: previousPort });
            messages.success(t('cli:commands.upgrade.daemonRestarted'));
          }
        }

        if (installExitCode === 0) {
          messages.success(t('cli:commands.upgrade.upgradeSuccess'));
          // After a successful upgrade, ensure shep is running. The
          // daemon-was-running branch has already restarted via the finally
          // above; if it was not running, start it now so `shep upgrade`
          // always leaves the user with a live daemon.
          if (!daemonWasRunning) {
            messages.info(t('cli:commands.upgrade.startingDaemon'));
            await startDaemon();
          }
        } else {
          if (daemonWasRunning) {
            messages.error(t('cli:commands.upgrade.upgradeFailedDaemonRestored'));
          } else {
            messages.error(t('cli:commands.upgrade.upgradeFailed'));
          }
          process.exitCode = 1;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.upgrade.upgradeFailed'), err);
        process.exitCode = 1;
      }
    });
}
