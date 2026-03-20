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
import { getFeatureFlags } from './lib/feature-flags.js';
import type { ICoastsService } from '@/application/ports/output/services/coasts-service.interface.js';
import { startCoastsDevServer, shutdownCoasts } from './coasts-dev-server.js';

const DEFAULT_PORT = 3000;

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

  // Track Coasts mode state for shutdown handler
  let coastsService: ICoastsService | null = null;
  let coastsWorkDir: string | null = null;

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
  } catch (error) {
    console.warn('[dev-server] DI initialization failed — features will be empty:', error);
  }

  // Step 2: Check coastsDevServer feature flag — branch to Coasts mode or bare Next.js
  const flags = getFeatureFlags();
  if (flags.coastsDevServer) {
    // --- Coasts mode: containerized runtime isolation ---
    const workDir = process.cwd();
    try {
      const service = container.resolve<ICoastsService>('ICoastsService');
      const instance = await startCoastsDevServer(service, workDir);
      coastsService = service;
      coastsWorkDir = workDir;
      console.log(`[dev-server:coasts] Dev server running in Coasts mode at ${instance.url}`);
    } catch (error) {
      console.error('[dev-server:coasts] Failed to start Coasts dev server:', error);
      process.exit(1);
    }

    // Graceful shutdown for Coasts mode
    let isShuttingDown = false;
    const shutdown = async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log('\n[dev-server:coasts] Shutting down...');
      const forceExit = setTimeout(() => process.exit(0), 2000);
      try {
        await shutdownCoasts(coastsService, coastsWorkDir!);
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
      } finally {
        clearTimeout(forceExit);
        process.exit(0);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  // --- Bare mode: standard Next.js dev server (default, unchanged) ---

  // Clean up lock file to allow multiple dev instances
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
