/**
 * _serve Command (hidden daemon entry point)
 *
 * Runs the web server in-process as a detached daemon child.
 * This command is hidden from --help output and is invoked internally by
 * the startDaemon() helper via child_process.spawn({detached: true}).
 *
 * NOTE: The DI container and settings are already initialized by index.ts
 * bootstrap() before Commander dispatches to this action. This command
 * only needs to start the web server and notification watcher.
 *
 * Lifecycle:
 *   1. Start WebServerService on the provided --port
 *   2. Initialize notification watcher
 *   3. Block until SIGTERM or SIGINT triggers graceful shutdown
 *
 * The shutdown sequence mirrors ui.command.ts:
 *   - Set isShuttingDown flag (idempotent — prevents double-shutdown)
 *   - Start 5s forceExit timer (unref'd so it doesn't block)
 *   - Stop notification watcher
 *   - Stop WebServerService
 *   - process.exit(0)
 *
 * Usage (internal only):
 *   process.execPath _serve --port <N>
 */

import { Command, InvalidArgumentError } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { setVersionEnvVars } from '@/infrastructure/services/version.service.js';
import { resolveWebDir } from '@/infrastructure/services/web-server.service.js';
import {
  initializeNotificationWatcher,
  getNotificationWatcher,
} from '@/infrastructure/services/notifications/notification-watcher.service.js';
import {
  initializeAutoArchiveWatcher,
  getAutoArchiveWatcher,
} from '@/infrastructure/services/auto-archive/auto-archive-watcher.service.js';
import {
  initializeStaleGoodFirstIssueWatcher,
  getStaleGoodFirstIssueWatcher,
} from '@/infrastructure/services/contributors/stale-good-first-issue-watcher.service.js';
import {
  initializeMonthlyRecapWatcher,
  getMonthlyRecapWatcher,
} from '@/infrastructure/services/contributors/monthly-recap-watcher.service.js';
import { DetectStaleGoodFirstIssueUseCase } from '@/application/use-cases/contributors/detect-stale-good-first-issue.use-case.js';
import { GenerateMonthlyRecapUseCase } from '@/application/use-cases/contributors/generate-monthly-recap.use-case.js';
import { PublishMonthlyRecapUseCase } from '@/application/use-cases/contributors/publish-monthly-recap.use-case.js';
import type { IVersionService } from '@/application/ports/output/services/version-service.interface.js';
import type { IWebServerService } from '@/application/ports/output/services/web-server-service.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { INotificationService } from '@/application/ports/output/services/notification-service.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IGitHubRepositoryService } from '@/application/ports/output/services/github-repository-service.interface.js';
import type { IDesktopNotifier } from '@/application/ports/output/services/i-desktop-notifier.js';
import type { IDeploymentService } from '@/application/ports/output/services/deployment-service.interface.js';
import { getCliI18n } from '../i18n.js';

function parsePort(value: string): number {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    throw new InvalidArgumentError(getCliI18n().t('cli:commands._serve.portValidation'));
  }
  return port;
}

/**
 * Create the hidden _serve command (daemon child entry point).
 */
export function createServeCommand(): Command {
  const t = getCliI18n().t;
  const cmd = new Command('_serve')
    .description(t('cli:commands._serve.description'))
    .helpOption(false)
    .addHelpCommand(false)
    .option('-p, --port <number>', t('cli:commands._serve.portOption'), parsePort)
    .action(async (options: { port?: number }) => {
      try {
        const port = options.port ?? 4050;
        const { dir, dev } = resolveWebDir();

        // Set version env vars for the web UI
        const versionService = container.resolve<IVersionService>('IVersionService');
        setVersionEnvVars(versionService.getVersion());

        // Start the web server
        const service = container.resolve<IWebServerService>('IWebServerService');
        await service.start(port, dir, dev);

        // Start notification watcher
        const runRepo = container.resolve<IAgentRunRepository>('IAgentRunRepository');
        const phaseTimingRepo = container.resolve<IPhaseTimingRepository>('IPhaseTimingRepository');
        const featureRepo = container.resolve<IFeatureRepository>('IFeatureRepository');
        const notificationService = container.resolve<INotificationService>('INotificationService');
        initializeNotificationWatcher(runRepo, phaseTimingRepo, featureRepo, notificationService);
        getNotificationWatcher().start();

        // Start auto-archive watcher
        initializeAutoArchiveWatcher(featureRepo);
        getAutoArchiveWatcher().start();

        // Start contributor pipeline watchers (spec 097, FR-42)
        const repositoryRepo = container.resolve<IRepositoryRepository>('IRepositoryRepository');
        const githubRepoService = container.resolve<IGitHubRepositoryService>(
          'IGitHubRepositoryService'
        );
        const desktopNotifier = container.resolve<IDesktopNotifier>('IDesktopNotifier');
        initializeStaleGoodFirstIssueWatcher(
          container.resolve(DetectStaleGoodFirstIssueUseCase),
          repositoryRepo,
          githubRepoService,
          desktopNotifier
        );
        getStaleGoodFirstIssueWatcher().start();
        initializeMonthlyRecapWatcher({
          generate: container.resolve(GenerateMonthlyRecapUseCase),
          publish: container.resolve(PublishMonthlyRecapUseCase),
        });
        getMonthlyRecapWatcher().start();

        // Start WhatsApp connection service (spec 101) — no-op unless the
        // whatsappDispatch flag is on AND the integration is enabled.
        const whatsappService = container.resolve<{
          start(): Promise<void>;
          stop(): Promise<void>;
        }>('WhatsAppConnectionService');
        void whatsappService.start();

        // Graceful shutdown handler — identical pattern to ui.command.ts
        let isShuttingDown = false;
        const shutdown = async () => {
          if (isShuttingDown) return;
          isShuttingDown = true;

          // Force exit after 5s if graceful shutdown stalls
          const forceExit = setTimeout(() => process.exit(0), 5000);
          forceExit.unref();

          getNotificationWatcher().stop();
          getAutoArchiveWatcher().stop();
          getStaleGoodFirstIssueWatcher().stop();
          getMonthlyRecapWatcher().stop();
          void whatsappService.stop();
          const deploymentService = container.resolve<IDeploymentService>('IDeploymentService');
          deploymentService.stopAll();
          await service.stop();
          process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        // Write to stderr so it appears in daemon logs if redirected
        process.stderr.write(`[_serve] Fatal error: ${err.message}\n`);
        process.exit(1);
      }
    });

  // Mark hidden so Commander omits it from --help output
  (cmd as unknown as { _hidden: boolean })._hidden = true;

  return cmd;
}
