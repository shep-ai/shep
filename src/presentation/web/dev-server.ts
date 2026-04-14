/**
 * Web UI Development Server
 *
 * Initializes the DI container (same as CLI bootstrap) and starts Next.js
 * programmatically in dev mode.
 *
 * Run via: tsx --tsconfig ../../tsconfig.json dev-server.ts
 */

/* eslint-disable no-console */

// IMPORTANT: reflect-metadata must be imported first for tsyringe DI
import 'reflect-metadata';

import next from 'next';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { initializeContainer, container } from '@/infrastructure/di/container.js';
import type { IDeploymentService } from '@/application/ports/output/services/deployment-service.interface.js';
import { InitializeSettingsUseCase } from '@/application/use-cases/settings/initialize-settings.use-case.js';
import { initializeSettings } from '@/infrastructure/services/settings.service.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { INotificationService } from '@/application/ports/output/services/notification-service.interface.js';
import {
  initializeNotificationWatcher,
  getNotificationWatcher,
} from '@/infrastructure/services/notifications/notification-watcher.service.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IGitForkService } from '@/application/ports/output/services/git-fork-service.interface.js';
import {
  initializePrSyncWatcher,
  getPrSyncWatcher,
} from '@/infrastructure/services/pr-sync/pr-sync-watcher.service.js';
import { getExistingConnection } from '@/infrastructure/persistence/sqlite/connection.js';
import {
  initializeAutoArchiveWatcher,
  getAutoArchiveWatcher,
} from '@/infrastructure/services/auto-archive/auto-archive-watcher.service.js';

const DEFAULT_PORT = 3000;

/**
 * Open the given URL in the user's default browser. Cross-platform:
 * uses `start` on Windows, `open` on macOS, and `xdg-open` on Linux.
 * Best-effort — if the command is missing or fails we just log and
 * carry on so the dev server itself is unaffected.
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;
  let args: string[];
  if (platform === 'win32') {
    // `start` is a cmd builtin, not a standalone executable — shell out
    // through cmd. The empty "" is the window title that `start` needs
    // when the first argument is quoted.
    command = 'cmd';
    args = ['/c', 'start', '""', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', (err) => {
      console.warn(`[dev-server] could not open browser (${command}): ${err.message}`);
    });
    child.unref();
  } catch (err) {
    console.warn(`[dev-server] could not open browser: ${String(err)}`);
  }
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: 'localhost', port });
    socket.on('connect', () => {
      socket.destroy();
      resolve(false); // Port is in use
    });
    socket.on('error', () => {
      resolve(true); // Port is available
    });
    setTimeout(() => {
      socket.destroy();
      resolve(true);
    }, 100);
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
  }
  return port;
}

async function main() {
  const basePort = process.env.PORT !== undefined ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
  const port = await findAvailablePort(basePort);

  // Step 1: Initialize DI container (database + migrations)
  // Same as CLI bootstrap (src/presentation/cli/index.ts:52-58)
  try {
    await initializeContainer();
    // Expose the DI container on globalThis for the web UI's server-side code
    (globalThis as Record<string, unknown>).__shepContainer = container;

    const initSettingsUseCase = container.resolve(InitializeSettingsUseCase);
    const settings = await initSettingsUseCase.execute();
    initializeSettings(settings);

    // Start notification watcher for real-time SSE events (same as shep ui)
    const runRepo = container.resolve<IAgentRunRepository>('IAgentRunRepository');
    const phaseTimingRepo = container.resolve<IPhaseTimingRepository>('IPhaseTimingRepository');
    const featureRepo = container.resolve<IFeatureRepository>('IFeatureRepository');
    const notificationService = container.resolve<INotificationService>('INotificationService');
    initializeNotificationWatcher(runRepo, phaseTimingRepo, featureRepo, notificationService);
    getNotificationWatcher().start();

    // Start PR sync watcher to detect PR/CI status transitions on GitHub
    const gitPrService = container.resolve<IGitPrService>('IGitPrService');
    const gitForkService = container.resolve<IGitForkService>('IGitForkService');
    const db = getExistingConnection();
    initializePrSyncWatcher(
      featureRepo,
      runRepo,
      gitPrService,
      notificationService,
      undefined,
      db,
      gitForkService
    );
    getPrSyncWatcher().start();

    // Start auto-archive watcher for completed features
    initializeAutoArchiveWatcher(featureRepo);
    getAutoArchiveWatcher().start();
  } catch (error) {
    console.warn('[dev-server] DI initialization failed — features will be empty:', error);
  }

  // Step 2: Clean up lock file to allow multiple dev instances
  const lockPath = path.join(import.meta.dirname, '.next', 'dev', 'lock');
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {
    // Lock file doesn't exist or couldn't be removed, continue anyway
  }

  // Start Next.js dev server
  const app = next({ dev: true, dir: import.meta.dirname, hostname: 'localhost', port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = http.createServer((req, res) => {
    handle(req!, res!);
  });

  // Forward WebSocket upgrades to Next.js for HMR/Fast Refresh
  server.on('upgrade', (req, socket, head) => {
    app.getUpgradeHandler()(req, socket, head);
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, 'localhost', () => {
      console.log(`[dev-server] Ready at http://localhost:${port}`);
      resolve();
    });
  });

  // Auto-open the dev URL in the default browser. Opt out with
  // BROWSER=none (matches the Create React App / Vite convention) so
  // CI, tmux panes, and headless SSH sessions don't spawn a browser.
  if (process.env.BROWSER !== 'none') {
    openBrowser(`http://localhost:${port}`);
  }

  // Graceful shutdown with timeout to avoid hanging on open connections
  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n[dev-server] Shutting down...');
    const forceExit = setTimeout(() => process.exit(0), 2000);
    try {
      try {
        const deploymentService = container.resolve<IDeploymentService>('IDeploymentService');
        deploymentService.stopAll();
      } catch {
        /* not initialized */
      }
      try {
        getNotificationWatcher().stop();
      } catch {
        /* not initialized */
      }
      try {
        getPrSyncWatcher().stop();
      } catch {
        /* not initialized */
      }
      try {
        getAutoArchiveWatcher().stop();
      } catch {
        /* not initialized */
      }
      server.closeAllConnections();
      await Promise.all([
        new Promise<void>((resolve) => server.close(() => resolve())),
        app.close(),
      ]);
    } finally {
      clearTimeout(forceExit);
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[dev-server] Fatal error:', error);
  process.exit(1);
});
