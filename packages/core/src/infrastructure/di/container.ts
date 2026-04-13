/**
 * Dependency Injection Container
 *
 * Configures tsyringe DI container with all application dependencies.
 * Registers repository implementations, use cases, and services.
 *
 * Usage:
 * ```typescript
 * import { container } from './infrastructure/di/container.js';
 * const useCase = container.resolve(InitializeSettingsUseCase);
 * ```
 */

import 'reflect-metadata';
import { container } from 'tsyringe';
import type Database from 'better-sqlite3';

// Database connection
import { getSQLiteConnection } from '../persistence/sqlite/connection.js';
import { runSQLiteMigrations } from '../persistence/sqlite/migrations.js';

// Eagerly-constructed services that cannot live in pure registration modules.
import type { IDeploymentService } from '../../application/ports/output/services/deployment-service.interface.js';
import { DeploymentService } from '../services/deployment/deployment.service.js';
import type { IInteractiveSessionRepository } from '../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IInteractiveMessageRepository } from '../../application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IWorkflowStepRepository } from '../../application/ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '../../application/ports/output/services/interactive-session-service.interface.js';
import type { IAgentExecutorFactory } from '../../application/ports/output/agents/agent-executor-factory.interface.js';
import type { IFeatureRepository } from '../../application/ports/output/repositories/feature-repository.interface.js';
import { InteractiveSessionService } from '../services/interactive/interactive-session.service.js';
import { FeatureContextBuilder } from '../services/interactive/feature-context.builder.js';

// Topic-grouped registration modules
import { registerRepositories } from './modules/register-repositories.js';
import { registerServices } from './modules/register-services.js';
import { registerTools } from './modules/register-tools.js';
import { registerAgents } from './modules/register-agents.js';
import { registerCloudDeploy } from './modules/register-cloud-deploy.js';
import { registerDeployment } from './modules/register-deployment.js';
import { registerUseCases } from './modules/register-use-cases.js';
import { registerInteractive } from './modules/register-interactive.js';

let _initialized = false;

/**
 * Initialize the DI container with all dependencies.
 * Must be called before resolving any dependencies.
 * Safe to call multiple times — returns existing container if already initialized.
 *
 * @returns Configured container instance
 */
export async function initializeContainer(): Promise<typeof container> {
  if (_initialized) {
    return container;
  }

  // Get database connection
  const db = await getSQLiteConnection();

  // Run migrations
  await runSQLiteMigrations(db);

  // Register database instance
  container.registerInstance<Database.Database>('Database', db);

  // ─── Topic-grouped registrations (pure, lazy) ────────────────────────────
  registerRepositories(container);
  registerServices(container);
  registerTools(container);
  registerAgents(container);
  registerCloudDeploy(container);
  registerDeployment(container);
  registerUseCases(container);
  registerInteractive(container);

  // ─── Eager deployment service ────────────────────────────────────────────
  // DeploymentService needs the database and calls `recoverAll()` at startup,
  // so it's constructed here and registered as a pre-built instance rather
  // than as a lazy singleton.
  const deploymentService = new DeploymentService();
  deploymentService.setDatabase(db);
  deploymentService.recoverAll();
  container.registerInstance<IDeploymentService>('IDeploymentService', deploymentService);

  // ─── Boot-time workflow-step recovery ────────────────────────────────────
  // Any step left in `running` by a previous daemon is orphaned. Flip it to
  // `interrupted` BEFORE any session can resolve so the UI never shows
  // phantom "in-progress" state from a dead process.
  const workflowStepRepoBoot =
    container.resolve<IWorkflowStepRepository>('IWorkflowStepRepository');
  const interruptedCount = await workflowStepRepoBoot.markAllRunningAsInterrupted();
  if (interruptedCount > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[workflow-step-recovery] marked ${interruptedCount} orphaned running step(s) as interrupted`
    );
  }

  // ─── Interactive session service (eager) ─────────────────────────────────
  // Constructed with already-resolved dependencies + the boot workflow-step
  // repo so the recovery state is shared with the running instance.
  const interactiveSessionRepo = container.resolve<IInteractiveSessionRepository>(
    'IInteractiveSessionRepository'
  );
  const interactiveMessageRepo = container.resolve<IInteractiveMessageRepository>(
    'IInteractiveMessageRepository'
  );
  const interactiveSessionService = new InteractiveSessionService(
    interactiveSessionRepo,
    interactiveMessageRepo,
    container.resolve<IAgentExecutorFactory>('IAgentExecutorFactory'),
    container.resolve<IFeatureRepository>('IFeatureRepository'),
    new FeatureContextBuilder(),
    workflowStepRepoBoot
  );
  container.registerInstance<IInteractiveSessionService>(
    'IInteractiveSessionService',
    interactiveSessionService
  );

  // Startup cleanup: mark any zombie sessions (booting/ready from a prior
  // server run) as stopped.
  await interactiveSessionRepo.markAllActiveStopped();

  _initialized = true;
  return container;
}

/**
 * Check whether the DI container has been initialized.
 * Useful for diagnostics and conditional initialization in instrumentation.ts.
 */
export function isContainerInitialized(): boolean {
  return _initialized;
}

/**
 * Get the configured container instance.
 * Container must be initialized first via initializeContainer().
 */
export { container };
