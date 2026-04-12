/**
 * Electron Backend Bootstrap
 *
 * Encapsulates the backend initialization sequence that the Electron main
 * process runs before displaying the web UI. Replicates the same pattern
 * used by dev-server.ts (lines 75-111) and _serve.command.ts (lines 69-111):
 *
 * 1. initializeContainer() — DB + migrations + all service registrations
 * 2. globalThis.__shepContainer = container — expose to Next.js server actions
 * 3. InitializeSettingsUseCase.execute() + initializeSettings()
 * 4. Start notification watcher
 * 5. Start PR sync watcher
 * 6. Start auto-archive watcher
 *
 * Does NOT start the web server — that is handled by main.ts after the
 * splash screen, because the web server port and window creation are
 * Electron-specific concerns.
 *
 * Returns a BootstrapResult containing stop functions for graceful shutdown.
 */

import type { DependencyContainer } from 'tsyringe';
import type { INotificationService } from '@shepai/core/application/ports/output/services/notification-service.interface.js';
import type { IAgentRunRepository } from '@shepai/core/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@shepai/core/application/ports/output/agents/phase-timing-repository.interface.js';
import type { IFeatureRepository } from '@shepai/core/application/ports/output/repositories/feature-repository.interface.js';
import type { IGitPrService } from '@shepai/core/application/ports/output/services/git-pr-service.interface.js';
import type { IGitForkService } from '@shepai/core/application/ports/output/services/git-fork-service.interface.js';
import type { IVersionService } from '@shepai/core/application/ports/output/services/version-service.interface.js';
import type { IDeploymentService } from '@shepai/core/application/ports/output/services/deployment-service.interface.js';

/** Injectable dependencies for the bootstrap process. */
export interface BootstrapDeps {
  /** Initializes the DI container (database + migrations + service registrations) */
  initializeContainer: () => Promise<DependencyContainer>;
  /** The DI container instance (available after initializeContainer()) */
  container: DependencyContainer;
  /** Initialize settings singleton from the resolved settings entity */
  initializeSettings: (settings: unknown) => void;
  /** Set version environment variables for the web UI */
  setVersionEnvVars: (info: { version: string; name: string; description: string }) => void;
  /** Notification watcher factory */
  initializeNotificationWatcher: (
    runRepo: IAgentRunRepository,
    phaseTimingRepo: IPhaseTimingRepository,
    featureRepo: IFeatureRepository,
    notificationService: INotificationService
  ) => void;
  getNotificationWatcher: () => { start(): void; stop(): void };
  /** PR sync watcher factory */
  initializePrSyncWatcher: (
    featureRepo: IFeatureRepository,
    agentRunRepo: IAgentRunRepository,
    gitPrService: IGitPrService,
    notificationService: INotificationService,
    pollIntervalMs?: number,
    db?: unknown,
    gitForkService?: IGitForkService | null
  ) => void;
  getPrSyncWatcher: () => { start(): void; stop(): void };
  /** Auto-archive watcher factory */
  initializeAutoArchiveWatcher: (featureRepo: IFeatureRepository) => void;
  getAutoArchiveWatcher: () => { start(): void; stop(): void };
  /** Get existing database connection (for PR sync watcher lock) */
  getExistingConnection: () => unknown;
}

/** Result of bootstrapping the backend. Contains stop functions for shutdown. */
export interface BootstrapResult {
  /** The DI container (for resolving services post-bootstrap) */
  container: DependencyContainer;
  /** Stop all watchers and services for graceful shutdown */
  shutdown: () => void;
}

/**
 * Initialize the backend: DI container, settings, version env vars, and
 * all background watchers.
 *
 * @param deps - Injectable dependencies (from @shepai/core imports)
 * @returns BootstrapResult with the container and a shutdown function
 */
export async function bootstrapBackend(deps: BootstrapDeps): Promise<BootstrapResult> {
  // Step 1: Initialize DI container (database + migrations)
  await deps.initializeContainer();

  // Step 2: Expose container on globalThis for Next.js server actions
  (globalThis as Record<string, unknown>).__shepContainer = deps.container;

  // Step 3: Initialize settings
  const { InitializeSettingsUseCase } = await import(
    '@shepai/core/application/use-cases/settings/initialize-settings.use-case.js'
  );
  const initSettingsUseCase = deps.container.resolve(InitializeSettingsUseCase);
  const settings = await initSettingsUseCase.execute();
  deps.initializeSettings(settings);

  // Step 4: Set version env vars for the web UI
  const versionService = deps.container.resolve<IVersionService>('IVersionService');
  deps.setVersionEnvVars(versionService.getVersion());

  // Step 5: Start notification watcher
  const runRepo = deps.container.resolve<IAgentRunRepository>('IAgentRunRepository');
  const phaseTimingRepo = deps.container.resolve<IPhaseTimingRepository>('IPhaseTimingRepository');
  const featureRepo = deps.container.resolve<IFeatureRepository>('IFeatureRepository');
  const notificationService = deps.container.resolve<INotificationService>('INotificationService');
  deps.initializeNotificationWatcher(runRepo, phaseTimingRepo, featureRepo, notificationService);
  deps.getNotificationWatcher().start();

  // Step 6: Start PR sync watcher
  const gitPrService = deps.container.resolve<IGitPrService>('IGitPrService');
  const gitForkService = deps.container.resolve<IGitForkService>('IGitForkService');
  const db = deps.getExistingConnection();
  deps.initializePrSyncWatcher(
    featureRepo,
    runRepo,
    gitPrService,
    notificationService,
    undefined,
    db,
    gitForkService
  );
  deps.getPrSyncWatcher().start();

  // Step 7: Start auto-archive watcher
  deps.initializeAutoArchiveWatcher(featureRepo);
  deps.getAutoArchiveWatcher().start();

  // Build shutdown function
  const shutdown = () => {
    try {
      deps.getNotificationWatcher().stop();
    } catch {
      /* not initialized */
    }
    try {
      deps.getPrSyncWatcher().stop();
    } catch {
      /* not initialized */
    }
    try {
      deps.getAutoArchiveWatcher().stop();
    } catch {
      /* not initialized */
    }
    try {
      const deploymentService = deps.container.resolve<IDeploymentService>('IDeploymentService');
      deploymentService.stopAll();
    } catch {
      /* not initialized */
    }
  };

  return { container: deps.container, shutdown };
}
