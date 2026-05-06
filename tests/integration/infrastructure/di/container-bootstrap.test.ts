/**
 * DI Container Bootstrap Integration Test
 *
 * Resolves every token that web routes and CLI commands depend on against the
 * real production registration modules. Catches the class of bugs where a
 * constructor uses @inject for a token that nobody ever registered — symptoms
 * include `GET /api/cloud-providers 500`, "Unregistered dependency token", and
 * "Cannot inject the dependency at position #N of <Class> constructor".
 *
 * Run order:
 *   1. Create a fresh tsyringe child container so registrations don't bleed
 *      into other tests.
 *   2. Register an in-memory SQLite Database under the 'Database' token.
 *   3. Run every registration module from packages/core/src/infrastructure/di/modules.
 *   4. Assert each token in `WEB_ROUTE_TOKENS` and `CRITICAL_INFRA_TOKENS`
 *      resolves without throwing AND constructs a non-null instance.
 *
 * If a registration is missing for any reason — direct token registration,
 * a transitive @inject in a deep dependency, a typo, anything — this test
 * fails with the exact tsyringe error pointing at the broken token.
 *
 * The list of route tokens is generated from the real route handlers under
 * src/presentation/web/app/api. When you add a new web route or CLI command
 * that calls `resolve<X>('X')`, add the token here too.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { container as rootContainer, type DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { registerRepositories } from '@/infrastructure/di/modules/register-repositories.js';
import { registerServices } from '@/infrastructure/di/modules/register-services.js';
import { registerTools } from '@/infrastructure/di/modules/register-tools.js';
import { registerAgents } from '@/infrastructure/di/modules/register-agents.js';
import { registerCloudDeploy } from '@/infrastructure/di/modules/register-cloud-deploy.js';
import { registerIntegrations } from '@/infrastructure/di/modules/register-integrations.js';
import { registerDeployment } from '@/infrastructure/di/modules/register-deployment.js';
import { registerUseCases } from '@/infrastructure/di/modules/register-use-cases.js';
import { registerInteractive } from '@/infrastructure/di/modules/register-interactive.js';
import type { IDeploymentService } from '@/application/ports/output/services/deployment-service.interface.js';
import { DeploymentService } from '@/infrastructure/services/deployment/deployment.service.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IInteractiveMessageRepository } from '@/application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IWorkflowStepRepository } from '@/application/ports/output/repositories/workflow-step-repository.interface.js';
import type { IInteractiveSessionService } from '@/application/ports/output/services/interactive-session-service.interface.js';
import type { IAgentExecutorFactory } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { InteractiveSessionService } from '@/infrastructure/services/interactive/interactive-session.service.js';
import { FeatureContextBuilder } from '@/infrastructure/services/interactive/feature-context.builder.js';
import { SessionRegistry } from '@/infrastructure/services/interactive/core/session-registry.js';
import { StreamEventDispatcher } from '@/infrastructure/services/interactive/core/stream-event-dispatcher.js';
import { SessionPersistence } from '@/infrastructure/services/interactive/core/session-persistence.js';
import { SettingsProviderAdapter } from '@/infrastructure/services/interactive/lifecycle/settings-provider.adapter.js';
import { AgentConfigResolver } from '@/infrastructure/services/interactive/lifecycle/agent-config.resolver.js';
import { AgentStreamConsumer } from '@/infrastructure/services/interactive/runtime/agent-stream.consumer.js';
import { BootPromptResolver } from '@/infrastructure/services/interactive/lifecycle/boot-prompt.resolver.js';
import { SessionBootstrapper } from '@/infrastructure/services/interactive/lifecycle/session-bootstrapper.js';
import { SessionTerminator } from '@/infrastructure/services/interactive/lifecycle/session-terminator.js';
import { TurnExecutor } from '@/infrastructure/services/interactive/runtime/turn.executor.js';
import { UserInteractionCoordinator } from '@/infrastructure/services/interactive/runtime/user-interaction.coordinator.js';
import { MessageDispatcher } from '@/infrastructure/services/interactive/api/message-dispatcher.js';
import { ChatStateAssembler } from '@/infrastructure/services/interactive/api/chat-state.assembler.js';
import { WorkflowHooks } from '@/infrastructure/services/interactive/api/workflow-hooks.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';

/**
 * String tokens resolved by web API routes. To regenerate, grep
 * src/presentation/web/app/api for `resolve<X>('X')` and capture the second
 * group. Keep this list in sync — the test iterates and resolves each one,
 * failing with the offending token name on any missing registration.
 */
const WEB_ROUTE_TOKENS: readonly string[] = [
  'AttachmentStorageService',
  'ConnectCloudProviderUseCase',
  'CreateGitRemoteUseCase',
  'CreateTerminalSessionUseCase',
  'EnsureGhAuthenticatedUseCase',
  'GetApplicationUseCase',
  'GetCloudDeploymentStatusUseCase',
  'GetGitStatusUseCase',
  'GetInteractiveChatStateUseCase',
  'IAgentRunRepository',
  'IDeploymentService',
  'IFeatureRepository',
  'IInteractiveSessionService',
  'ILogger',
  'ITerminalSessionService',
  'IVersionService',
  'InitiateCloudDeploymentUseCase',
  'InstallToolUseCase',
  'LaunchToolUseCase',
  'ListApplicationFilesUseCase',
  'ListApplicationsUseCase',
  'ListCloudProvidersUseCase',
  'ListFeaturesUseCase',
  'ListOperationLogEntriesUseCase',
  'ListRepositoriesUseCase',
  'ListToolsUseCase',
  'ReadApplicationFileRawUseCase',
  'ReadApplicationFileUseCase',
  'RespondToInteractionUseCase',
  'ResumeApplicationWorkflowUseCase',
  'SelectCloudProviderUseCase',
  'SendInteractiveMessageUseCase',
  'StartInteractiveSessionUseCase',
  'StopInteractiveSessionUseCase',
  'StreamAgentEventsUseCase',
  'SyncRepoUseCase',
  'UpgradeCliUseCase',
  'WatchApplicationFilesUseCase',
  'WriteApplicationFileUseCase',
] as const;

/**
 * Tokens that aren't directly resolved by routes but their absence breaks
 * downstream construction. Listing them here gives a clearer error message
 * if someone deletes a registration.
 */
const CRITICAL_INFRA_TOKENS: readonly string[] = [
  'IApplicationRepository',
  'IPhaseTimingRepository',
  'IInteractiveSessionRepository',
  'IInteractiveMessageRepository',
  'IWorkflowStepRepository',
  'IFileSystemService',
  'ISettingsRepository',
  'ISpecArtifactParser',
  'IProcessLivenessProbe',
  'IWorktreePathProvider',
  'IToolMetadataProvider',
  'INodeHelpers',
  'IPhaseTimingContext',
  'IConflictResolutionService',
  'IAttachmentStorageService',
  'IGitCommitService',
  'IGitRemoteService',
  'ListGitHubOrganizationsUseCase',
  'IGitHubRepositoryService',
  'ICloudDeploymentProviderRegistry',
  'ICloudDeploymentEventBus',
  'ICloudProviderTokensRepository',
  'CloudflareProviderClock',
  'FetchFunction',
  'ExecFunction',
  'IAgentSessionRepositoryRegistry',
  'IAgentExecutorFactory',
  'IAgentExecutorProvider',
  'IOperationLogRepository',
  'IOperationLogService',
  // Supervisor pipeline (spec 093). The feature-agent worker eagerly
  // constructs FeatureAgentGateQuestionPublisher → AskAgentQuestionUseCase →
  // AgentQuestionSupervisorRouter → EvaluateSupervisorDecisionUseCase, which
  // injects 'ISupervisorAgent'. A missing registration here crashes the worker
  // at boot — list the token explicitly so any future deletion fails this test
  // instead of feature runs.
  'ISupervisorAgent',
  'IAgentPromptResolver',
  'ISupervisorPolicyRepository',
  'ISupervisorDecisionRepository',
] as const;

describe('DI container bootstrap (integration)', () => {
  let scopedContainer: DependencyContainer;
  let db: Database.Database;
  let prevShepHome: string | undefined;
  let prevHome: string | undefined;

  beforeAll(async () => {
    // Tsyringe doesn't expose a clean "fresh root" — but childContainer() gives
    // us an isolated registry that doesn't pollute the global root.
    scopedContainer = rootContainer.createChildContainer();

    // Override the shep home so loadOrCreateSecretKey() (called inside
    // register-cloud-deploy via a useFactory) writes into a tmp dir instead
    // of the real ~/.shep.
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'shep-di-bootstrap-test-'));
    prevShepHome = process.env.SHEP_HOME;
    prevHome = process.env.HOME;
    process.env.SHEP_HOME = tmpRoot;
    // On Windows, getShepHomeDir() falls back to os.homedir() if SHEP_HOME is
    // unset. We set both so the tmp dir is used regardless of platform.
    process.env.HOME = tmpRoot;

    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    scopedContainer.registerInstance<Database.Database>('Database', db);

    registerRepositories(scopedContainer);
    registerServices(scopedContainer);
    registerTools(scopedContainer);
    registerAgents(scopedContainer);
    registerCloudDeploy(scopedContainer);
    registerIntegrations(scopedContainer);
    registerDeployment(scopedContainer);
    registerUseCases(scopedContainer);
    registerInteractive(scopedContainer);

    // Replicate the eager bootstrap done by initializeContainer() so the
    // test exercises the SAME container shape that web routes see at runtime.
    // IDeploymentService and IInteractiveSessionService are not registered by
    // the lazy modules — they're constructed eagerly because they need to
    // hold mutable runtime state (running workflows, in-memory caches).
    const deploymentService = new DeploymentService();
    deploymentService.setDatabase(db);
    deploymentService.recoverAll();
    scopedContainer.registerInstance<IDeploymentService>('IDeploymentService', deploymentService);

    const workflowStepRepoBoot =
      scopedContainer.resolve<IWorkflowStepRepository>('IWorkflowStepRepository');
    await workflowStepRepoBoot.markAllRunningAsInterrupted();

    const interactiveSessionRepo = scopedContainer.resolve<IInteractiveSessionRepository>(
      'IInteractiveSessionRepository'
    );
    const interactiveMessageRepo = scopedContainer.resolve<IInteractiveMessageRepository>(
      'IInteractiveMessageRepository'
    );
    const sessionRegistry = new SessionRegistry();
    const streamEventDispatcher = new StreamEventDispatcher(sessionRegistry);
    const sessionPersistence = new SessionPersistence(
      interactiveMessageRepo,
      interactiveSessionRepo,
      sessionRegistry,
      streamEventDispatcher
    );
    const settingsProvider = new SettingsProviderAdapter();
    const agentConfigResolver = new AgentConfigResolver(settingsProvider);
    const noop = (_msg: string, _meta?: Record<string, unknown>) => undefined;
    const logger: ILogger = { debug: noop, info: noop, warn: noop, error: noop };
    const streamConsumer = new AgentStreamConsumer(
      sessionPersistence,
      streamEventDispatcher,
      logger
    );
    const featureRepository = scopedContainer.resolve<IFeatureRepository>('IFeatureRepository');
    const agentExecutorFactory =
      scopedContainer.resolve<IAgentExecutorFactory>('IAgentExecutorFactory');
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
    scopedContainer.registerInstance<IInteractiveSessionService>(
      'IInteractiveSessionService',
      interactiveSessionService
    );
    await interactiveSessionRepo.markAllActiveStopped();
  });

  afterAll(() => {
    db?.close();
    if (prevShepHome === undefined) delete process.env.SHEP_HOME;
    else process.env.SHEP_HOME = prevShepHome;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
  });

  describe('every web-route token resolves', () => {
    for (const token of WEB_ROUTE_TOKENS) {
      it(`resolves '${token}' without throwing`, () => {
        let instance: unknown;
        expect(() => {
          instance = scopedContainer.resolve(token);
        }).not.toThrow();
        expect(instance).toBeDefined();
        expect(instance).not.toBeNull();
      });
    }
  });

  describe('every critical infra token resolves', () => {
    for (const token of CRITICAL_INFRA_TOKENS) {
      it(`resolves '${token}' without throwing`, () => {
        let instance: unknown;
        expect(() => {
          instance = scopedContainer.resolve(token);
        }).not.toThrow();
        expect(instance).toBeDefined();
        expect(instance).not.toBeNull();
      });
    }
  });

  interface RegistryShape {
    listAll(): readonly { id: string; displayName: string; enabled: boolean }[];
  }

  interface ListUseCaseShape {
    execute(): Promise<readonly { id: string; enabled: boolean; connected: boolean }[]>;
  }

  describe('cloud-deploy registry constructs every provider end-to-end', () => {
    it('resolves ICloudDeploymentProviderRegistry and lists all 5 providers without DI errors', () => {
      const registry = scopedContainer.resolve<RegistryShape>('ICloudDeploymentProviderRegistry');
      const providers = registry.listAll();
      expect(providers.length).toBe(5);
      expect(providers.map((p) => p.id).sort()).toEqual(
        ['AwsAmplify', 'CloudflarePages', 'GcpCloudRun', 'Netlify', 'Vercel'].sort()
      );
    });
  });

  describe('ListCloudProvidersUseCase end-to-end', () => {
    it('produces the 5 known providers when called via DI', async () => {
      const useCase = scopedContainer.resolve<ListUseCaseShape>('ListCloudProvidersUseCase');
      const providers = await useCase.execute();
      expect(providers.length).toBe(5);
      const ids = providers.map((p) => p.id);
      expect(ids).toContain('CloudflarePages');
    });
  });
});
