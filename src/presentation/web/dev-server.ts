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
import { createRequestListener } from '@/infrastructure/services/http-request-listener.js';
import { initializeContainer, container } from '@/infrastructure/di/container.js';
import { warmAgentModelCatalogs } from '@/infrastructure/services/agents/common/model-catalogs/warm-agent-model-catalogs.js';
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
import type { IMessagingService } from '@/application/ports/output/services/messaging-service.interface.js';
import type { ITunnelService } from '@/application/ports/output/services/tunnel-service.interface.js';
import type { IWebhookService as IGitHubWebhookServiceType } from '@/application/ports/output/services/webhook-service.interface.js';
import {
  initializeWebhookManager,
  getWebhookManager,
  hasWebhookManager,
} from '@/infrastructure/services/webhook/webhook-manager.service.js';
import {
  ALLOW_PUBLIC_BIND_ENV,
  BIND_HOST_ENV,
  ENV_FLAG_ON,
  WEB_PORT_ENV,
  resolveBindHost,
} from '@/infrastructure/services/web-server.service.js';

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
    // Probe the loopback address, not the bind meta-address. 0.0.0.0 is a
    // bind-only address and gives unreliable connect results across platforms.
    const socket = net.createConnection({ host: '127.0.0.1', port });
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

    if (process.env.SHEP_COLLABORATION_FLAG === '1' && settings.featureFlags) {
      settings.featureFlags.collaboration = true;
    }

    initializeSettings(settings);

    // Prefetch live model catalogs so the picker hits TTL cache on first open.
    void warmAgentModelCatalogs(container).catch((error) =>
      console.warn('[dev-server] model catalog warm failed:', error)
    );

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

    // Optionally start the messaging remote-control service.
    // Dev mode skips this by default because it opens a persistent
    // WebSocket tunnel to the gateway and is not something every
    // developer wants running on every `pnpm dev:web` invocation.
    // Opt in with SHEP_ENABLE_MESSAGING=1.
    if (process.env.SHEP_ENABLE_MESSAGING === '1') {
      try {
        const messagingService = container.resolve<IMessagingService>('IMessagingService');
        if (messagingService.isConfigured()) {
          await messagingService.start();
          console.log('[dev-server] messaging remote control started');
        } else {
          console.log(
            '[dev-server] SHEP_ENABLE_MESSAGING=1 but messaging is not configured yet — pair a platform in Settings first'
          );
        }
      } catch (err) {
        console.warn('[dev-server] failed to start messaging service:', err);
      }
    }

    // Start webhook system (optional — falls back to polling if cloudflared is not installed)
    try {
      const tunnelService = container.resolve<ITunnelService>('ITunnelService');
      const webhookService = container.resolve<IGitHubWebhookServiceType>('IGitHubWebhookService');
      initializeWebhookManager(tunnelService, webhookService);
      // Start is async and non-blocking — failures are logged, not thrown
      void getWebhookManager().start(port);
    } catch (error) {
      console.warn('[dev-server] Webhook system init failed (using polling fallback):', error);
    }
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
  // Choose the listen address. The dev server has the same powers as the
  // production daemon (it spawns shells and installs tools), so it no longer
  // hard-binds 0.0.0.0 — a public bind needs SHEP_ALLOW_PUBLIC_BIND=1 and is
  // announced. Next's own hostname stays 'localhost' so it generates correct
  // relative URLs regardless of the interface.
  const { host: bindHost, warning: bindWarning } = resolveBindHost(
    process.env[BIND_HOST_ENV],
    process.env[ALLOW_PUBLIC_BIND_ENV] === ENV_FLAG_ON
  );
  if (bindWarning) {
    console.warn(`[dev-server] ${bindWarning}`);
  }

  // Publish the port so `middleware.ts` can reject Host headers naming a
  // different port (DNS rebinding defence).
  process.env[WEB_PORT_ENV] = String(port);

  const app = next({ dev: true, dir: import.meta.dirname, hostname: 'localhost', port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = http.createServer(createRequestListener(handle));

  // Forward WebSocket upgrades to Next.js for HMR/Fast Refresh
  server.on('upgrade', (req, socket, head) => {
    app.getUpgradeHandler()(req, socket, head);
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    // Advertise localhost regardless of the bind address — a meta-address
    // such as 0.0.0.0 is not a routable browser destination.
    server.listen(port, bindHost, () => {
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
        if (hasWebhookManager()) {
          await getWebhookManager().stop();
        }
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
      try {
        const messagingService = container.resolve<IMessagingService>('IMessagingService');
        await messagingService.stop();
      } catch {
        /* not initialized or not running */
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
