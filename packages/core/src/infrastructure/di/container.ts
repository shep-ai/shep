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
import { SessionRegistry } from '../services/interactive/core/session-registry.js';
import { StreamEventDispatcher } from '../services/interactive/core/stream-event-dispatcher.js';
import { SessionPersistence } from '../services/interactive/core/session-persistence.js';
import { SettingsProviderAdapter } from '../services/interactive/lifecycle/settings-provider.adapter.js';
import { AgentConfigResolver } from '../services/interactive/lifecycle/agent-config.resolver.js';
import { AgentStreamConsumer } from '../services/interactive/runtime/agent-stream.consumer.js';
import { BootPromptResolver } from '../services/interactive/lifecycle/boot-prompt.resolver.js';
import { SessionBootstrapper } from '../services/interactive/lifecycle/session-bootstrapper.js';
import { SessionTerminator } from '../services/interactive/lifecycle/session-terminator.js';
import { TurnExecutor } from '../services/interactive/runtime/turn.executor.js';
import { UserInteractionCoordinator } from '../services/interactive/runtime/user-interaction.coordinator.js';
import { MessageDispatcher } from '../services/interactive/api/message-dispatcher.js';
import { ChatStateAssembler } from '../services/interactive/api/chat-state.assembler.js';
import { WorkflowHooks } from '../services/interactive/api/workflow-hooks.js';
import type { ILogger } from '../../application/ports/output/services/logger.interface.js';

// Topic-grouped registration modules
import { registerRepositories } from './modules/register-repositories.js';
import { registerServices } from './modules/register-services.js';
import { registerTools } from './modules/register-tools.js';
import { registerAgents } from './modules/register-agents.js';
import { registerCloudDeploy } from './modules/register-cloud-deploy.js';
import { registerIntegrations } from './modules/register-integrations.js';
import { registerDeployment } from './modules/register-deployment.js';
import { registerUseCases } from './modules/register-use-cases.js';
import { registerPmUseCases } from './modules/register-pm-use-cases.js';
import { registerInteractive } from './modules/register-interactive.js';
import { registerWhatsApp } from './modules/register-whatsapp.js';

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
  registerIntegrations(container);
  registerDeployment(container);
  registerUseCases(container);
  registerPmUseCases(container);
  registerInteractive(container);
  registerWhatsApp(container);

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
  const sessionRegistry = new SessionRegistry();
  const streamEventDispatcher = new StreamEventDispatcher(sessionRegistry);
  // SessionPersistence is a process-wide singleton so its monotonic
  // `createdAt` counter is shared across every write. See
  // `core/session-persistence.ts` for why strictly-increasing timestamps
  // matter (tool_use / tool_result collisions).
  const sessionPersistence = new SessionPersistence(
    interactiveMessageRepo,
    interactiveSessionRepo,
    sessionRegistry,
    streamEventDispatcher
  );
  // Settings-provider port + agent-config resolver. The adapter is the
  // one legitimate place the `settings.service` singleton is called —
  // everywhere else consults it through the injected port. Registered
  // by token so application-layer use cases (e.g. CreateApplicationUseCase)
  // can resolve the user's default agent without bypassing the port
  // contract.
  const settingsProvider = new SettingsProviderAdapter();
  container.registerInstance('ISettingsProvider', settingsProvider);
  const agentConfigResolver = new AgentConfigResolver(settingsProvider);

  const logger: ILogger = {
    // eslint-disable-next-line no-console
    debug: (msg, meta) => console.debug(`[shep] ${msg}`, meta ?? ''),
    // eslint-disable-next-line no-console
    info: (msg, meta) => console.info(`[shep] ${msg}`, meta ?? ''),
    // eslint-disable-next-line no-console
    warn: (msg, meta) => console.warn(`[shep] ${msg}`, meta ?? ''),
    // eslint-disable-next-line no-console
    error: (msg, meta) => console.error(`[shep] ${msg}`, meta ?? ''),
  };
  const streamConsumer = new AgentStreamConsumer(sessionPersistence, streamEventDispatcher, logger);
  const featureRepository = container.resolve<IFeatureRepository>('IFeatureRepository');
  const agentExecutorFactory = container.resolve<IAgentExecutorFactory>('IAgentExecutorFactory');
  const featureContextBuilder = new FeatureContextBuilder();
  const bootPromptResolver = new BootPromptResolver(featureRepository, featureContextBuilder);
  const interactionCoordinator = new UserInteractionCoordinator(
    sessionPersistence,
    streamEventDispatcher,
    logger,
    sessionRegistry
  );
  const bootstrapper = new SessionBootstrapper(
    interactiveSessionRepo,
    sessionRegistry,
    sessionPersistence,
    streamEventDispatcher,
    bootPromptResolver,
    streamConsumer,
    agentExecutorFactory,
    agentConfigResolver,
    interactionCoordinator,
    logger
  );
  const terminator = new SessionTerminator(
    sessionRegistry,
    sessionPersistence,
    streamEventDispatcher,
    logger,
    interactiveMessageRepo,
    workflowStepRepoBoot
  );
  const turnExecutor = new TurnExecutor(
    interactiveSessionRepo,
    sessionRegistry,
    sessionPersistence,
    streamConsumer,
    logger,
    streamEventDispatcher
  );
  const messageDispatcher = new MessageDispatcher(
    interactiveSessionRepo,
    interactiveMessageRepo,
    sessionRegistry,
    sessionPersistence,
    bootstrapper,
    terminator,
    turnExecutor
  );
  const chatStateAssembler = new ChatStateAssembler(
    interactiveMessageRepo,
    interactiveSessionRepo,
    workflowStepRepoBoot,
    sessionRegistry
  );
  const workflowHooks = new WorkflowHooks(sessionRegistry, streamEventDispatcher);
  const interactiveSessionService = new InteractiveSessionService(
    interactiveSessionRepo,
    interactiveMessageRepo,
    featureRepository,
    featureContextBuilder,
    workflowStepRepoBoot,
    sessionRegistry,
    streamEventDispatcher,
    sessionPersistence,
    logger,
    bootstrapper,
    terminator,
    turnExecutor,
    interactionCoordinator,
    messageDispatcher,
    chatStateAssembler,
    workflowHooks
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
