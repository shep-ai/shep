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

// Repository interfaces and implementations
import type { ISettingsRepository } from '../../application/ports/output/repositories/settings.repository.interface.js';
import { SQLiteSettingsRepository } from '../repositories/sqlite-settings.repository.js';
import type { IFeatureRepository } from '../../application/ports/output/repositories/feature-repository.interface.js';
import { SQLiteFeatureRepository } from '../repositories/sqlite-feature.repository.js';
import type { IRepositoryRepository } from '../../application/ports/output/repositories/repository-repository.interface.js';
import { SQLiteRepositoryRepository } from '../repositories/sqlite-repository.repository.js';
import type { IApplicationRepository } from '../../application/ports/output/repositories/application-repository.interface.js';
import { SQLiteApplicationRepository } from '../repositories/sqlite-application.repository.js';

// Validator interfaces and implementations
import type { IAgentValidator } from '../../application/ports/output/agents/agent-validator.interface.js';
import { AgentValidatorService } from '../services/agents/common/agent-validator.service.js';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { IS_WINDOWS } from '../platform.js';

// Service interfaces and implementations
import type { IVersionService } from '../../application/ports/output/services/version-service.interface.js';
import { VersionService } from '../services/version.service.js';
import type { IWebServerService } from '../../application/ports/output/services/web-server-service.interface.js';
import type { IWorktreeService } from '../../application/ports/output/services/worktree-service.interface.js';
import { WorktreeService } from '../services/git/worktree.service.js';
import type { IFileSystemService } from '../../application/ports/output/services/file-system-service.interface.js';
import { FileSystemService } from '../services/file-system.service.js';
import type { IApplicationBriefStore } from '../../application/ports/output/services/application-brief-store.interface.js';
import { ApplicationBriefStore } from '../services/filesystem/application-brief.store.js';
import type { IProjectScaffoldService } from '../../application/ports/output/services/project-scaffold-service.interface.js';
import { FsProjectScaffoldService } from '../services/project-scaffold/fs-project-scaffold.service.js';
import type { IApplicationCreationPromptBuilder } from '../../application/ports/output/services/application-creation-prompt-builder.interface.js';
import { ApplicationCreationPromptBuilder } from '../services/agents/application-creation/application-creation-prompt.builder.js';
import type { IAgentAuthDetectorService } from '../../application/ports/output/services/agent-auth-detector.interface.js';
import { PlatformAgentAuthDetectorService } from '../services/agent-auth-detector/platform-agent-auth-detector.service.js';
import type { IToolInstallerService } from '../../application/ports/output/services/tool-installer.service.js';
import { ToolInstallerServiceImpl } from '../services/tool-installer/tool-installer.service.js';
import type { IGitPrService } from '../../application/ports/output/services/git-pr-service.interface.js';
import { GitPrService } from '../services/git/git-pr.service.js';
import type { IGitForkService } from '../../application/ports/output/services/git-fork-service.interface.js';
import { GitForkService } from '../services/git/git-fork.service.js';
import type { ISkillInjectorService } from '../../application/ports/output/services/skill-injector.interface.js';
import { SkillInjectorService } from '../services/skill-injector.service.js';
import type { IIdeLauncherService } from '../../application/ports/output/services/ide-launcher-service.interface.js';
import { JsonDrivenIdeLauncherService } from '../services/ide-launchers/json-driven-ide-launcher.service.js';
import type { IDaemonService } from '../../application/ports/output/services/daemon-service.interface.js';
import { DaemonPidService } from '../services/daemon/daemon-pid.service.js';
import type { IDeploymentService } from '../../application/ports/output/services/deployment-service.interface.js';
import { DeploymentService } from '../services/deployment/deployment.service.js';
import type { IShepInstanceService } from '../../application/ports/output/services/shep-instance-service.interface.js';
import { ShepInstanceService } from '../services/shep-instance.service.js';
import { AttachmentStorageService } from '../services/attachment-storage.service.js';
import type { IGitHubRepositoryService } from '../../application/ports/output/services/github-repository-service.interface.js';
import { GitHubRepositoryService } from '../services/external/github-repository.service.js';
import type { IBrowserOpener } from '../../application/ports/output/services/i-browser-opener.js';
import { BrowserOpenerService } from '../services/browser-opener.service.js';
import type { ITerminalSessionService } from '../../application/ports/output/services/terminal-session-service.interface.js';
import { PtyTerminalSessionService } from '../services/terminal/pty-terminal-session.service.js';
import { CreateTerminalSessionUseCase } from '../../application/use-cases/terminal/create-terminal-session.use-case.js';
import type { IApplicationFileSystemService } from '../../application/ports/output/services/application-file-system-service.interface.js';
import { NodeApplicationFileSystemService } from '../services/filesystem/node-application-file-system.service.js';
import { ListApplicationFilesUseCase } from '../../application/use-cases/applications/list-application-files.use-case.js';
import { ReadApplicationFileUseCase } from '../../application/use-cases/applications/read-application-file.use-case.js';
import { ReadApplicationFileRawUseCase } from '../../application/use-cases/applications/read-application-file-raw.use-case.js';
import { WriteApplicationFileUseCase } from '../../application/use-cases/applications/write-application-file.use-case.js';
import { WatchApplicationFilesUseCase } from '../../application/use-cases/applications/watch-application-files.use-case.js';

// Agent infrastructure interfaces and implementations
import type { IAgentExecutorFactory } from '../../application/ports/output/agents/agent-executor-factory.interface.js';
import type { IAgentExecutorProvider } from '../../application/ports/output/agents/agent-executor-provider.interface.js';
import type { IStructuredAgentCaller } from '../../application/ports/output/agents/structured-agent-caller.interface.js';
import type { IAgentRegistry } from '../../application/ports/output/agents/agent-registry.interface.js';
import type { IAgentRunner } from '../../application/ports/output/agents/agent-runner.interface.js';
import type { IAgentRunRepository } from '../../application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '../../application/ports/output/agents/phase-timing-repository.interface.js';
import type { IFeatureAgentProcessService } from '../../application/ports/output/agents/feature-agent-process.interface.js';
import type { ISpecInitializerService } from '../../application/ports/output/services/spec-initializer.interface.js';
import type { INotificationService } from '../../application/ports/output/services/notification-service.interface.js';
import { AgentExecutorFactory } from '../services/agents/common/agent-executor-factory.service.js';
import { AgentExecutorProvider } from '../services/agents/common/agent-executor-provider.service.js';
import { StructuredAgentCallerService } from '../services/agents/common/structured-agent-caller.service.js';
import { MockAgentExecutorFactory } from '../services/agents/common/executors/mock-executor-factory.service.js';
import { AgentRegistryService } from '../services/agents/common/agent-registry.service.js';
import { AgentRunnerService } from '../services/agents/common/agent-runner.service.js';
import { SQLiteAgentRunRepository } from '../repositories/agent-run.repository.js';
import { SQLitePhaseTimingRepository } from '../repositories/sqlite-phase-timing.repository.js';
import { FeatureAgentProcessService } from '../services/agents/feature-agent/feature-agent-process.service.js';
import { SpecInitializerService } from '../services/spec/spec-initializer.service.js';
import { DesktopNotifier } from '../services/notifications/desktop-notifier.js';
import { NotificationService } from '../services/notifications/notification.service.js';
import { getNotificationBus } from '../services/notifications/notification-bus.js';
import { spawn } from 'node:child_process';

// Use cases
import { InitializeSettingsUseCase } from '../../application/use-cases/settings/initialize-settings.use-case.js';
import { LoadSettingsUseCase } from '../../application/use-cases/settings/load-settings.use-case.js';
import { UpdateSettingsUseCase } from '../../application/use-cases/settings/update-settings.use-case.js';
import { CompleteOnboardingUseCase } from '../../application/use-cases/settings/complete-onboarding.use-case.js';
import { CompleteWebOnboardingUseCase } from '../../application/use-cases/settings/complete-web-onboarding.use-case.js';
import { ConfigureAgentUseCase } from '../../application/use-cases/agents/configure-agent.use-case.js';
import { ValidateAgentAuthUseCase } from '../../application/use-cases/agents/validate-agent-auth.use-case.js';
import { RunAgentUseCase } from '../../application/use-cases/agents/run-agent.use-case.js';
import { GetAgentRunUseCase } from '../../application/use-cases/agents/get-agent-run.use-case.js';
import { ListAgentRunsUseCase } from '../../application/use-cases/agents/list-agent-runs.use-case.js';
import { StopAgentRunUseCase } from '../../application/use-cases/agents/stop-agent-run.use-case.js';
import { DeleteAgentRunUseCase } from '../../application/use-cases/agents/delete-agent-run.use-case.js';
import { ApproveAgentRunUseCase } from '../../application/use-cases/agents/approve-agent-run.use-case.js';
import { RejectAgentRunUseCase } from '../../application/use-cases/agents/reject-agent-run.use-case.js';
import { ReviewFeatureUseCase } from '../../application/use-cases/agents/review-feature.use-case.js';
import { CreateFeatureUseCase } from '../../application/use-cases/features/create/create-feature.use-case.js';
import { MetadataGenerator } from '../../application/use-cases/features/create/metadata-generator.js';
import { SlugResolver } from '../../application/use-cases/features/create/slug-resolver.js';
import { ListFeaturesUseCase } from '../../application/use-cases/features/list-features.use-case.js';
import { ShowFeatureUseCase } from '../../application/use-cases/features/show-feature.use-case.js';
import { DeleteFeatureUseCase } from '../../application/use-cases/features/delete-feature.use-case.js';
import { ResumeFeatureUseCase } from '../../application/use-cases/features/resume-feature.use-case.js';
import { StartFeatureUseCase } from '../../application/use-cases/features/start-feature.use-case.js';
import { UpdateFeaturePinnedConfigUseCase } from '../../application/use-cases/features/update-feature-pinned-config.use-case.js';
import { AdoptBranchUseCase } from '../../application/use-cases/features/adopt-branch.use-case.js';
import { GetFeatureArtifactUseCase } from '../../application/use-cases/features/get-feature-artifact.use-case.js';
import { GetResearchArtifactUseCase } from '../../application/use-cases/features/get-research-artifact.use-case.js';
import { GetPlanArtifactUseCase } from '../../application/use-cases/features/get-plan-artifact.use-case.js';
import { ValidateToolAvailabilityUseCase } from '../../application/use-cases/tools/validate-tool-availability.use-case.js';
import { InstallToolUseCase } from '../../application/use-cases/tools/install-tool.use-case.js';
import { ListToolsUseCase } from '../../application/use-cases/tools/list-tools.use-case.js';
import { LaunchToolUseCase } from '../../application/use-cases/tools/launch-tool.use-case.js';
import { LaunchIdeUseCase } from '../../application/use-cases/ide/launch-ide.use-case.js';
import { AddRepositoryUseCase } from '../../application/use-cases/repositories/add-repository.use-case.js';
import { CreateProjectUseCase } from '../../application/use-cases/projects/create-project.use-case.js';
import { CheckAgentAuthUseCase } from '../../application/use-cases/agents/check-agent-auth.use-case.js';
import { ListRepositoriesUseCase } from '../../application/use-cases/repositories/list-repositories.use-case.js';
import { DeleteRepositoryUseCase } from '../../application/use-cases/repositories/delete-repository.use-case.js';
import { ImportGitHubRepositoryUseCase } from '../../application/use-cases/repositories/import-github-repository.use-case.js';
import { InitRemoteRepositoryUseCase } from '../../application/use-cases/repositories/init-remote-repository.use-case.js';
import { ListGitHubRepositoriesUseCase } from '../../application/use-cases/repositories/list-github-repositories.use-case.js';
import { ListGitHubOrganizationsUseCase } from '../../application/use-cases/repositories/list-github-organizations.use-case.js';
import { CreateFeatureFromRemoteUseCase } from '../../application/use-cases/features/create/create-feature-from-remote.use-case.js';
import { CheckAndUnblockFeaturesUseCase } from '../../application/use-cases/features/check-and-unblock-features.use-case.js';
import { UpdateFeatureLifecycleUseCase } from '../../application/use-cases/features/update/update-feature-lifecycle.use-case.js';
import { CleanupFeatureWorktreeUseCase } from '../../application/use-cases/features/cleanup-feature-worktree.use-case.js';
import { ArchiveFeatureUseCase } from '../../application/use-cases/features/archive-feature.use-case.js';
import { UnarchiveFeatureUseCase } from '../../application/use-cases/features/unarchive-feature.use-case.js';
import { UpgradeCliUseCase } from '../../application/use-cases/upgrade/upgrade-cli.use-case.js';
import { SyncRepositoryMainUseCase } from '../../application/use-cases/repositories/sync-repository-main.use-case.js';
import { RebaseFeatureOnMainUseCase } from '../../application/use-cases/features/rebase-feature-on-main.use-case.js';
import { GetBranchSyncStatusUseCase } from '../../application/use-cases/features/get-branch-sync-status.use-case.js';
import { ConflictResolutionService } from '../services/agents/conflict-resolution/conflict-resolution.service.js';
import { AutoResolveMergedBranchesUseCase } from '../../application/use-cases/features/auto-resolve-merged-branches.use-case.js';
import { CreateApplicationUseCase } from '../../application/use-cases/applications/create-application.use-case.js';
import { ListApplicationsUseCase } from '../../application/use-cases/applications/list-applications.use-case.js';
import { GetApplicationUseCase } from '../../application/use-cases/applications/get-application.use-case.js';
import { DeleteApplicationUseCase } from '../../application/use-cases/applications/delete-application.use-case.js';
import { ResumeApplicationWorkflowUseCase } from '../../application/use-cases/applications/resume-application-workflow.use-case.js';
import { UpdateApplicationUseCase } from '../../application/use-cases/applications/update-application.use-case.js';

// Deployment use cases
import { StartFeatureDeploymentUseCase } from '../../application/use-cases/deployments/start-feature-deployment.use-case.js';
import { StartRepositoryDeploymentUseCase } from '../../application/use-cases/deployments/start-repository-deployment.use-case.js';
import { StopDeploymentUseCase } from '../../application/use-cases/deployments/stop-deployment.use-case.js';
import { GetDeploymentStatusUseCase } from '../../application/use-cases/deployments/get-deployment-status.use-case.js';
import { ListDeploymentsUseCase } from '../../application/use-cases/deployments/list-deployments.use-case.js';

// Interactive session use cases
import { StartInteractiveSessionUseCase } from '../../application/use-cases/interactive/start-interactive-session.use-case.js';
import { SendInteractiveMessageUseCase } from '../../application/use-cases/interactive/send-interactive-message.use-case.js';
import { StopInteractiveSessionUseCase } from '../../application/use-cases/interactive/stop-interactive-session.use-case.js';
import { GetInteractiveChatStateUseCase } from '../../application/use-cases/interactive/get-interactive-chat-state.use-case.js';
import { RespondToInteractionUseCase } from '../../application/use-cases/interactive/respond-to-interaction.use-case.js';

// Session listing
import { ClaudeCodeSessionRepository } from '../services/agents/sessions/claude-code-session.repository.js';
import { CodexCliSessionRepository } from '../services/agents/sessions/codex-cli-session.repository.js';
import { StubSessionRepository } from '../services/agents/sessions/stub-session.repository.js';
import { AgentSessionRepositoryRegistry } from '../../application/services/agents/agent-session-repository.registry.js';
import { ListAgentSessionsUseCase } from '../../application/use-cases/agents/list-agent-sessions.use-case.js';
import { GetAgentSessionUseCase } from '../../application/use-cases/agents/get-agent-session.use-case.js';
import { AgentType } from '../../domain/generated/output.js';

// Database connection
import { getSQLiteConnection } from '../persistence/sqlite/connection.js';
import { runSQLiteMigrations } from '../persistence/sqlite/migrations.js';

// Interactive session infrastructure
import type { IInteractiveSessionRepository } from '../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IInteractiveMessageRepository } from '../../application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IInteractiveSessionService } from '../../application/ports/output/services/interactive-session-service.interface.js';
import type { IWorkflowStepRepository } from '../../application/ports/output/repositories/workflow-step-repository.interface.js';
import { SQLiteInteractiveSessionRepository } from '../repositories/sqlite-interactive-session.repository.js';
import { SQLiteInteractiveMessageRepository } from '../repositories/sqlite-interactive-message.repository.js';
import { SQLiteWorkflowStepRepository } from '../repositories/sqlite-workflow-step.repository.js';
import { InteractiveSessionService } from '../services/interactive/interactive-session.service.js';
import { FeatureContextBuilder } from '../services/interactive/feature-context.builder.js';
import { RunWorkflowUseCase } from '../../application/use-cases/workflows/run-workflow.use-case.js';

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

  // Register repositories
  container.register<ISettingsRepository>('ISettingsRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteSettingsRepository(database);
    },
  });

  container.register<IFeatureRepository>('IFeatureRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteFeatureRepository(database);
    },
  });

  container.register<IRepositoryRepository>('IRepositoryRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteRepositoryRepository(database);
    },
  });

  container.register<IApplicationRepository>('IApplicationRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteApplicationRepository(database);
    },
  });

  // Register external dependencies as tokens
  // On Windows, agent CLIs ship as .cmd/.ps1 scripts (e.g. cursor's `agent.cmd`).
  // execFile without shell: true cannot resolve .cmd extensions, causing ENOENT.
  const execFileAsync = promisify(execFile);
  const execFn = IS_WINDOWS
    ? (file: string, args: string[], options?: object) =>
        execFileAsync(file, args, { ...options, shell: true, windowsHide: true })
    : execFileAsync;
  container.registerInstance('ExecFunction', execFn);

  // Register services (singletons via @injectable + token)
  container.registerSingleton<IAgentValidator>('IAgentValidator', AgentValidatorService);
  container.registerSingleton<IVersionService>('IVersionService', VersionService);
  // IWebServerService is registered as a lazy proxy to avoid importing `next`
  // (~80ms) for non-web commands. The actual service is loaded on first method call.
  container.register<IWebServerService>('IWebServerService', {
    useFactory: () => {
      let instance: IWebServerService | null = null;
      const getInstance = async (): Promise<IWebServerService> => {
        if (!instance) {
          const { WebServerService } = await import('../services/web-server.service.js');
          instance = new WebServerService();
        }
        return instance;
      };
      return new Proxy({} as IWebServerService, {
        get: (_target, prop) => {
          return async (...args: unknown[]) => {
            const svc = await getInstance();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (svc as any)[prop](...args);
          };
        },
      });
    },
  });
  container.registerSingleton<IWorktreeService>('IWorktreeService', WorktreeService);
  container.registerSingleton<IFileSystemService>('IFileSystemService', FileSystemService);
  container.registerSingleton<IApplicationBriefStore>(
    'IApplicationBriefStore',
    ApplicationBriefStore
  );
  container.registerSingleton<IProjectScaffoldService>(
    'IProjectScaffoldService',
    FsProjectScaffoldService
  );
  container.registerSingleton<IApplicationCreationPromptBuilder>(
    'IApplicationCreationPromptBuilder',
    ApplicationCreationPromptBuilder
  );
  container.registerSingleton<IAgentAuthDetectorService>(
    'IAgentAuthDetectorService',
    PlatformAgentAuthDetectorService
  );
  container.registerSingleton<ISkillInjectorService>('ISkillInjectorService', SkillInjectorService);
  container.registerSingleton<IToolInstallerService>(
    'IToolInstallerService',
    ToolInstallerServiceImpl
  );
  container.registerSingleton<IGitPrService>('IGitPrService', GitPrService);
  container.registerSingleton<IGitForkService>('IGitForkService', GitForkService);
  container.registerSingleton<IGitHubRepositoryService>(
    'IGitHubRepositoryService',
    GitHubRepositoryService
  );
  container.registerSingleton<IIdeLauncherService>(
    'IIdeLauncherService',
    JsonDrivenIdeLauncherService
  );
  container.registerSingleton<IDaemonService>('IDaemonService', DaemonPidService);
  container.registerSingleton<IApplicationFileSystemService>(
    'IApplicationFileSystemService',
    NodeApplicationFileSystemService
  );
  container.registerSingleton<ITerminalSessionService>(
    'ITerminalSessionService',
    PtyTerminalSessionService
  );
  container.registerSingleton(AttachmentStorageService);
  container.register('AttachmentStorageService', { useToken: AttachmentStorageService });
  const deploymentService = new DeploymentService();
  deploymentService.setDatabase(db);
  deploymentService.recoverAll();
  container.registerInstance<IDeploymentService>('IDeploymentService', deploymentService);
  container.registerSingleton<IShepInstanceService>('IShepInstanceService', ShepInstanceService);

  // Register agent infrastructure
  container.register<IAgentRunRepository>('IAgentRunRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteAgentRunRepository(database);
    },
  });

  container.register<IPhaseTimingRepository>('IPhaseTimingRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePhaseTimingRepository(database);
    },
  });

  if (process.env.SHEP_MOCK_EXECUTOR === '1') {
    container.register<IAgentExecutorFactory>('IAgentExecutorFactory', {
      useFactory: () => new MockAgentExecutorFactory(),
    });
  } else {
    container.register<IAgentExecutorFactory>('IAgentExecutorFactory', {
      useFactory: () => {
        // Wrap spawn with sensible defaults: stdio piped and windowsHide on Win32.
        // Each executor controls its own `shell` option — cursor needs shell: true
        // for .cmd scripts, but claude-code must NOT use shell (DEP0190 / prompt mangling).
        const spawnWithPipe = (command: string, args: string[], options?: object) => {
          return spawn(command, args, {
            stdio: 'pipe',
            ...(process.platform === 'win32' ? { windowsHide: true } : {}),
            ...options,
          });
        };
        return new AgentExecutorFactory(spawnWithPipe);
      },
    });
  }

  container.register<IAgentExecutorProvider>('IAgentExecutorProvider', {
    useFactory: (c) => {
      const factory = c.resolve<IAgentExecutorFactory>('IAgentExecutorFactory');
      const settingsRepo = c.resolve<ISettingsRepository>('ISettingsRepository');
      return new AgentExecutorProvider(factory, settingsRepo);
    },
  });

  container.register<IStructuredAgentCaller>('IStructuredAgentCaller', {
    useFactory: (c) => {
      const provider = c.resolve<IAgentExecutorProvider>('IAgentExecutorProvider');
      const factory = c.resolve<IAgentExecutorFactory>('IAgentExecutorFactory');
      return new StructuredAgentCallerService(provider, factory);
    },
  });

  container.register<IAgentRegistry>('IAgentRegistry', {
    useFactory: () => new AgentRegistryService(),
  });

  container.register<IAgentRunner>('IAgentRunner', {
    useFactory: (c) => {
      const registry = c.resolve<IAgentRegistry>('IAgentRegistry');
      const executorProvider = c.resolve<IAgentExecutorProvider>('IAgentExecutorProvider');
      const runRepository = c.resolve<IAgentRunRepository>('IAgentRunRepository');
      // Checkpointer is lazy-loaded to avoid ~240ms startup cost from
      // @langchain/langgraph-checkpoint-sqlite on every CLI invocation.
      return new AgentRunnerService(registry, executorProvider, runRepository);
    },
  });

  container.register<IFeatureAgentProcessService>('IFeatureAgentProcessService', {
    useFactory: (c) => {
      const runRepository = c.resolve<IAgentRunRepository>('IAgentRunRepository');
      return new FeatureAgentProcessService(runRepository);
    },
  });

  container.register<ISpecInitializerService>('ISpecInitializerService', {
    useFactory: () => new SpecInitializerService(),
  });

  // Register notification services
  const notificationBus = getNotificationBus();

  container.registerInstance('NotificationEventBus', notificationBus);

  container.register('DesktopNotifier', {
    useFactory: () => new DesktopNotifier(),
  });

  container.register<INotificationService>('INotificationService', {
    useFactory: (c) => {
      const bus = c.resolve('NotificationEventBus') as ReturnType<typeof getNotificationBus>;
      const desktopNotif = c.resolve('DesktopNotifier') as DesktopNotifier;
      return new NotificationService(bus, desktopNotif);
    },
  });

  // Register browser opener service
  container.register<IBrowserOpener>('IBrowserOpener', {
    useFactory: () => new BrowserOpenerService(),
  });

  // Register use cases (singletons for performance)
  container.registerSingleton(InitializeSettingsUseCase);
  container.registerSingleton(LoadSettingsUseCase);
  container.registerSingleton(UpdateSettingsUseCase);
  container.registerSingleton(CompleteOnboardingUseCase);
  container.registerSingleton(CompleteWebOnboardingUseCase);
  container.registerSingleton(ConfigureAgentUseCase);
  container.registerSingleton(ValidateAgentAuthUseCase);
  container.registerSingleton(RunAgentUseCase);
  container.registerSingleton(GetAgentRunUseCase);
  container.registerSingleton(ListAgentRunsUseCase);
  container.registerSingleton(StopAgentRunUseCase);
  container.registerSingleton(DeleteAgentRunUseCase);
  container.registerSingleton(ApproveAgentRunUseCase);
  container.registerSingleton(RejectAgentRunUseCase);
  container.registerSingleton(ReviewFeatureUseCase);
  container.registerSingleton(MetadataGenerator);
  container.registerSingleton(SlugResolver);
  container.registerSingleton(CreateFeatureUseCase);
  container.registerSingleton(ListFeaturesUseCase);
  container.registerSingleton(ShowFeatureUseCase);
  container.registerSingleton(DeleteFeatureUseCase);
  container.registerSingleton(ResumeFeatureUseCase);
  container.registerSingleton(StartFeatureUseCase);
  container.registerSingleton(UpdateFeaturePinnedConfigUseCase);
  container.registerSingleton(AdoptBranchUseCase);
  container.registerSingleton(GetFeatureArtifactUseCase);
  container.registerSingleton(GetResearchArtifactUseCase);
  container.registerSingleton(GetPlanArtifactUseCase);
  container.registerSingleton(ValidateToolAvailabilityUseCase);
  container.registerSingleton(InstallToolUseCase);
  container.registerSingleton(ListToolsUseCase);
  container.registerSingleton(LaunchToolUseCase);
  container.registerSingleton(LaunchIdeUseCase);
  container.registerSingleton(CreateTerminalSessionUseCase);
  container.registerSingleton(ListApplicationFilesUseCase);
  container.registerSingleton(ReadApplicationFileUseCase);
  container.registerSingleton(ReadApplicationFileRawUseCase);
  container.registerSingleton(WriteApplicationFileUseCase);
  container.registerSingleton(WatchApplicationFilesUseCase);
  container.registerSingleton(AddRepositoryUseCase);
  container.registerSingleton(CreateProjectUseCase);
  container.registerSingleton(CheckAgentAuthUseCase);
  container.registerSingleton(ListRepositoriesUseCase);
  container.registerSingleton(DeleteRepositoryUseCase);
  container.registerSingleton(ImportGitHubRepositoryUseCase);
  container.registerSingleton(InitRemoteRepositoryUseCase);
  container.registerSingleton(CreateFeatureFromRemoteUseCase);
  container.registerSingleton(ListGitHubRepositoriesUseCase);
  container.registerSingleton(ListGitHubOrganizationsUseCase);
  // CheckAndUnblockFeaturesUseCase must be registered before UpdateFeatureLifecycleUseCase
  // because the latter injects the former via class token.
  container.registerSingleton(CheckAndUnblockFeaturesUseCase);
  container.registerSingleton(UpdateFeatureLifecycleUseCase);
  container.registerSingleton(CleanupFeatureWorktreeUseCase);
  container.registerSingleton(ArchiveFeatureUseCase);
  container.registerSingleton(UnarchiveFeatureUseCase);
  container.registerSingleton(UpgradeCliUseCase);
  container.registerSingleton(ConflictResolutionService);
  container.register('ConflictResolutionService', {
    useFactory: (c) => c.resolve(ConflictResolutionService),
  });
  container.registerSingleton(SyncRepositoryMainUseCase);
  container.registerSingleton(RebaseFeatureOnMainUseCase);
  container.registerSingleton(GetBranchSyncStatusUseCase);
  container.registerSingleton(AutoResolveMergedBranchesUseCase);
  container.registerSingleton(CreateApplicationUseCase);
  container.registerSingleton(ListApplicationsUseCase);
  container.registerSingleton(GetApplicationUseCase);
  container.registerSingleton(DeleteApplicationUseCase);
  container.registerSingleton(ResumeApplicationWorkflowUseCase);
  container.registerSingleton(UpdateApplicationUseCase);

  // Deployment use cases
  container.registerSingleton(StartFeatureDeploymentUseCase);
  container.registerSingleton(StartRepositoryDeploymentUseCase);
  container.registerSingleton(StopDeploymentUseCase);
  container.registerSingleton(GetDeploymentStatusUseCase);
  container.registerSingleton(ListDeploymentsUseCase);

  // Session repositories (per-AgentType string tokens)
  container.register(`IAgentSessionRepository:${AgentType.ClaudeCode}`, {
    useFactory: () => new ClaudeCodeSessionRepository(),
  });
  container.register(`IAgentSessionRepository:${AgentType.Cursor}`, {
    useFactory: () => new StubSessionRepository(AgentType.Cursor),
  });
  container.register(`IAgentSessionRepository:${AgentType.GeminiCli}`, {
    useFactory: () => new StubSessionRepository(AgentType.GeminiCli),
  });
  container.register(`IAgentSessionRepository:${AgentType.CodexCli}`, {
    useFactory: () => new CodexCliSessionRepository(),
  });
  container.register(`IAgentSessionRepository:${AgentType.CopilotCli}`, {
    useFactory: () => new StubSessionRepository(AgentType.CopilotCli),
  });

  container.registerSingleton(AgentSessionRepositoryRegistry);
  container.registerSingleton(ListAgentSessionsUseCase);
  container.registerSingleton(GetAgentSessionUseCase);

  // String-token aliases for web routes (Turbopack can't resolve .js→.ts
  // imports inside @shepai/core, so routes use string tokens instead of class refs)
  container.register('CreateFeatureUseCase', {
    useFactory: (c) => c.resolve(CreateFeatureUseCase),
  });
  container.register('ListFeaturesUseCase', {
    useFactory: (c) => c.resolve(ListFeaturesUseCase),
  });
  container.register('ShowFeatureUseCase', {
    useFactory: (c) => c.resolve(ShowFeatureUseCase),
  });
  container.register('DeleteFeatureUseCase', {
    useFactory: (c) => c.resolve(DeleteFeatureUseCase),
  });
  container.register('ResumeFeatureUseCase', {
    useFactory: (c) => c.resolve(ResumeFeatureUseCase),
  });
  container.register('StartFeatureUseCase', {
    useFactory: (c) => c.resolve(StartFeatureUseCase),
  });
  container.register('UpdateFeaturePinnedConfigUseCase', {
    useFactory: (c) => c.resolve(UpdateFeaturePinnedConfigUseCase),
  });
  container.register('AdoptBranchUseCase', {
    useFactory: (c) => c.resolve(AdoptBranchUseCase),
  });
  container.register('StopAgentRunUseCase', {
    useFactory: (c) => c.resolve(StopAgentRunUseCase),
  });
  container.register('ApproveAgentRunUseCase', {
    useFactory: (c) => c.resolve(ApproveAgentRunUseCase),
  });
  container.register('RejectAgentRunUseCase', {
    useFactory: (c) => c.resolve(RejectAgentRunUseCase),
  });
  container.register('GetFeatureArtifactUseCase', {
    useFactory: (c) => c.resolve(GetFeatureArtifactUseCase),
  });
  container.register('GetResearchArtifactUseCase', {
    useFactory: (c) => c.resolve(GetResearchArtifactUseCase),
  });
  container.register('GetPlanArtifactUseCase', {
    useFactory: (c) => c.resolve(GetPlanArtifactUseCase),
  });
  container.register('InstallToolUseCase', {
    useFactory: (c) => c.resolve(InstallToolUseCase),
  });
  container.register('ListToolsUseCase', {
    useFactory: (c) => c.resolve(ListToolsUseCase),
  });
  container.register('LaunchToolUseCase', {
    useFactory: (c) => c.resolve(LaunchToolUseCase),
  });
  container.register('LaunchIdeUseCase', {
    useFactory: (c) => c.resolve(LaunchIdeUseCase),
  });
  container.register('AddRepositoryUseCase', {
    useFactory: (c) => c.resolve(AddRepositoryUseCase),
  });
  container.register('CreateProjectUseCase', {
    useFactory: (c) => c.resolve(CreateProjectUseCase),
  });
  container.register('CheckAgentAuthUseCase', {
    useFactory: (c) => c.resolve(CheckAgentAuthUseCase),
  });
  container.register('ListRepositoriesUseCase', {
    useFactory: (c) => c.resolve(ListRepositoriesUseCase),
  });
  container.register('DeleteRepositoryUseCase', {
    useFactory: (c) => c.resolve(DeleteRepositoryUseCase),
  });
  container.register('ImportGitHubRepositoryUseCase', {
    useFactory: (c) => c.resolve(ImportGitHubRepositoryUseCase),
  });
  container.register('InitRemoteRepositoryUseCase', {
    useFactory: (c) => c.resolve(InitRemoteRepositoryUseCase),
  });
  container.register('CreateFeatureFromRemoteUseCase', {
    useFactory: (c) => c.resolve(CreateFeatureFromRemoteUseCase),
  });
  container.register('ListGitHubRepositoriesUseCase', {
    useFactory: (c) => c.resolve(ListGitHubRepositoriesUseCase),
  });
  container.register('ListGitHubOrganizationsUseCase', {
    useFactory: (c) => c.resolve(ListGitHubOrganizationsUseCase),
  });
  container.register('CheckAndUnblockFeaturesUseCase', {
    useFactory: (c) => c.resolve(CheckAndUnblockFeaturesUseCase),
  });
  container.register('UpdateFeatureLifecycleUseCase', {
    useFactory: (c) => c.resolve(UpdateFeatureLifecycleUseCase),
  });
  container.register('LoadSettingsUseCase', {
    useFactory: (c) => c.resolve(LoadSettingsUseCase),
  });
  container.register('UpdateSettingsUseCase', {
    useFactory: (c) => c.resolve(UpdateSettingsUseCase),
  });
  container.register('CompleteWebOnboardingUseCase', {
    useFactory: (c) => c.resolve(CompleteWebOnboardingUseCase),
  });
  container.register('CleanupFeatureWorktreeUseCase', {
    useFactory: (c) => c.resolve(CleanupFeatureWorktreeUseCase),
  });
  container.register('ArchiveFeatureUseCase', {
    useFactory: (c) => c.resolve(ArchiveFeatureUseCase),
  });
  container.register('UnarchiveFeatureUseCase', {
    useFactory: (c) => c.resolve(UnarchiveFeatureUseCase),
  });
  container.register('StartFeatureDeploymentUseCase', {
    useFactory: (c) => c.resolve(StartFeatureDeploymentUseCase),
  });
  container.register('StartRepositoryDeploymentUseCase', {
    useFactory: (c) => c.resolve(StartRepositoryDeploymentUseCase),
  });
  container.register('StopDeploymentUseCase', {
    useFactory: (c) => c.resolve(StopDeploymentUseCase),
  });
  container.register('GetDeploymentStatusUseCase', {
    useFactory: (c) => c.resolve(GetDeploymentStatusUseCase),
  });
  container.register('ListDeploymentsUseCase', {
    useFactory: (c) => c.resolve(ListDeploymentsUseCase),
  });
  container.register('UpgradeCliUseCase', {
    useFactory: (c) => c.resolve(UpgradeCliUseCase),
  });
  container.register('SyncRepositoryMainUseCase', {
    useFactory: (c) => c.resolve(SyncRepositoryMainUseCase),
  });
  container.register('RebaseFeatureOnMainUseCase', {
    useFactory: (c) => c.resolve(RebaseFeatureOnMainUseCase),
  });
  container.register('GetBranchSyncStatusUseCase', {
    useFactory: (c) => c.resolve(GetBranchSyncStatusUseCase),
  });
  container.register('AutoResolveMergedBranchesUseCase', {
    useFactory: (c) => c.resolve(AutoResolveMergedBranchesUseCase),
  });
  container.register('CreateApplicationUseCase', {
    useFactory: (c) => c.resolve(CreateApplicationUseCase),
  });
  container.register('ListApplicationsUseCase', {
    useFactory: (c) => c.resolve(ListApplicationsUseCase),
  });
  container.register('GetApplicationUseCase', {
    useFactory: (c) => c.resolve(GetApplicationUseCase),
  });
  container.register('DeleteApplicationUseCase', {
    useFactory: (c) => c.resolve(DeleteApplicationUseCase),
  });
  container.register('ResumeApplicationWorkflowUseCase', {
    useFactory: (c) => c.resolve(ResumeApplicationWorkflowUseCase),
  });
  container.register('UpdateApplicationUseCase', {
    useFactory: (c) => c.resolve(UpdateApplicationUseCase),
  });
  container.register('ListApplicationFilesUseCase', {
    useFactory: (c) => c.resolve(ListApplicationFilesUseCase),
  });
  container.register('ReadApplicationFileUseCase', {
    useFactory: (c) => c.resolve(ReadApplicationFileUseCase),
  });
  container.register('ReadApplicationFileRawUseCase', {
    useFactory: (c) => c.resolve(ReadApplicationFileRawUseCase),
  });
  container.register('WriteApplicationFileUseCase', {
    useFactory: (c) => c.resolve(WriteApplicationFileUseCase),
  });
  container.register('WatchApplicationFilesUseCase', {
    useFactory: (c) => c.resolve(WatchApplicationFilesUseCase),
  });
  container.register('CreateTerminalSessionUseCase', {
    useFactory: (c) => c.resolve(CreateTerminalSessionUseCase),
  });

  // Register interactive session infrastructure
  container.register<IInteractiveSessionRepository>('IInteractiveSessionRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteInteractiveSessionRepository(database);
    },
  });

  container.register<IInteractiveMessageRepository>('IInteractiveMessageRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteInteractiveMessageRepository(database);
    },
  });

  container.register<IWorkflowStepRepository>('IWorkflowStepRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLiteWorkflowStepRepository(database);
    },
  });

  // Boot-time recovery: any step left in `running` by a previous
  // daemon is orphaned. Flip it to `interrupted` BEFORE any session
  // can resolve so the UI never shows phantom "in-progress" state
  // from a dead process.
  const workflowStepRepoBoot =
    container.resolve<IWorkflowStepRepository>('IWorkflowStepRepository');
  const interruptedCount = await workflowStepRepoBoot.markAllRunningAsInterrupted();
  if (interruptedCount > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[workflow-step-recovery] marked ${interruptedCount} orphaned running step(s) as interrupted`
    );
  }

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

  // Register interactive session use cases
  container.registerSingleton(StartInteractiveSessionUseCase);
  container.registerSingleton(SendInteractiveMessageUseCase);
  container.registerSingleton(StopInteractiveSessionUseCase);
  container.registerSingleton(GetInteractiveChatStateUseCase);
  container.registerSingleton(RespondToInteractionUseCase);

  // String-token aliases for web routes (Turbopack can't resolve .js→.ts
  // imports inside @shepai/core, so routes use string tokens instead of class refs)
  container.register('StartInteractiveSessionUseCase', {
    useFactory: (c) => c.resolve(StartInteractiveSessionUseCase),
  });
  container.register('SendInteractiveMessageUseCase', {
    useFactory: (c) => c.resolve(SendInteractiveMessageUseCase),
  });
  container.register('StopInteractiveSessionUseCase', {
    useFactory: (c) => c.resolve(StopInteractiveSessionUseCase),
  });
  container.register('GetInteractiveChatStateUseCase', {
    useFactory: (c) => c.resolve(GetInteractiveChatStateUseCase),
  });
  container.register('RespondToInteractionUseCase', {
    useFactory: (c) => c.resolve(RespondToInteractionUseCase),
  });

  container.registerSingleton(RunWorkflowUseCase);
  container.register('RunWorkflowUseCase', {
    useFactory: (c) => c.resolve(RunWorkflowUseCase),
  });

  // Startup cleanup: mark any zombie sessions (booting/ready from a prior server run) as stopped
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
