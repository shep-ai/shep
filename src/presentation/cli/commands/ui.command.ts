/**
 * UI Command
 *
 * Starts the Shep web UI server.
 * Runs Next.js in the same process as the CLI, sharing the DI container.
 *
 * Usage: shep ui [--port <number>]
 *
 * @example
 * $ shep ui
 * Shep Web UI
 * Starting web server...
 *
 * ✓ Server ready at http://localhost:4050
 * ℹ Press Ctrl+C to stop
 */

import { Command, InvalidArgumentError } from 'commander';
import { findAvailablePort, DEFAULT_PORT } from '@/infrastructure/services/port.service.js';
import { container } from '@/infrastructure/di/container.js';
import type { IVersionService } from '@/application/ports/output/services/version-service.interface.js';
import type { IWebServerService } from '@/application/ports/output/services/web-server-service.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { INotificationService } from '@/application/ports/output/services/notification-service.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IGitForkService } from '@/application/ports/output/services/git-fork-service.interface.js';
import { setVersionEnvVars } from '@/infrastructure/services/version.service.js';
import { resolveWebDir } from '@/infrastructure/services/web-server.service.js';
import {
  initializeNotificationWatcher,
  getNotificationWatcher,
} from '@/infrastructure/services/notifications/notification-watcher.service.js';
import {
  initializePrSyncWatcher,
  getPrSyncWatcher,
} from '@/infrastructure/services/pr-sync/pr-sync-watcher.service.js';
import {
  initializeAutoArchiveWatcher,
  getAutoArchiveWatcher,
} from '@/infrastructure/services/auto-archive/auto-archive-watcher.service.js';
import { getExistingConnection } from '@/infrastructure/persistence/sqlite/connection.js';
import type { IBrowserOpener } from '@/application/ports/output/services/i-browser-opener.js';
import { colors, fmt, messages } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

function parsePort(value: string): number {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    throw new InvalidArgumentError(getCliI18n().t('cli:commands.ui.portValidation'));
  }
  return port;
}

/**
 * Create the ui command
 */
export function createUiCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ui')
    .description(t('cli:commands.ui.description'))
    .option('-p, --port <number>', t('cli:commands.ui.portOption'), parsePort)
    .option('--no-open', t('cli:commands.ui.noOpenOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep ui                 Start on default port (4050)
  $ shep ui --port 8080     Start on custom port
  $ shep ui --no-open       Start without opening browser`
    )
    .action(async (options: { port?: number; open?: boolean }) => {
      try {
        const startPort = options.port ?? DEFAULT_PORT;
        const port = await findAvailablePort(startPort);
        const { dir, dev } = resolveWebDir();

        // Set version env vars so Next.js web UI can read them
        const versionService = container.resolve<IVersionService>('IVersionService');
        setVersionEnvVars(versionService.getVersion());

        messages.newline();
        console.log(fmt.heading(t('cli:commands.ui.heading')));
        console.log(
          colors.muted(dev ? t('cli:commands.ui.startingDev') : t('cli:commands.ui.starting'))
        );
        messages.newline();

        const service = container.resolve<IWebServerService>('IWebServerService');
        await service.start(port, dir, dev);

        // Start notification watcher to detect agent status transitions
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

        const url = `http://localhost:${port}`;
        messages.success(t('cli:commands.ui.serverReady', { url: fmt.code(url) }));
        messages.info(t('cli:commands.ui.pressCtrlC'));
        messages.newline();

        // Auto-open browser (unless --no-open)
        if (options.open !== false) {
          const opener = container.resolve<IBrowserOpener>('IBrowserOpener');
          opener.open(url);
        }

        // Handle graceful shutdown via SIGINT/SIGTERM
        // The HTTP server keeps the event loop alive — no explicit wait needed
        let isShuttingDown = false;
        const shutdown = async () => {
          if (isShuttingDown) return;
          isShuttingDown = true;
          messages.newline();
          messages.info(t('cli:commands.ui.shuttingDown'));

          // Force exit after 5s if graceful shutdown stalls
          const forceExit = setTimeout(() => process.exit(0), 5000);
          forceExit.unref();

          getPrSyncWatcher().stop();
          getNotificationWatcher().stop();
          getAutoArchiveWatcher().stop();
          await service.stop();
          process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.ui.failedToStart'), err);
        process.exitCode = 1;
      }
    });
}
