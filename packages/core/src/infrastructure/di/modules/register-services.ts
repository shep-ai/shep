import type { DependencyContainer } from 'tsyringe';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import { IS_WINDOWS } from '../../platform.js';

import type { IAgentValidator } from '../../../application/ports/output/agents/agent-validator.interface.js';
import { AgentValidatorService } from '../../services/agents/common/agent-validator.service.js';
import type { IVersionService } from '../../../application/ports/output/services/version-service.interface.js';
import { VersionService } from '../../services/version.service.js';
import type { IWebServerService } from '../../../application/ports/output/services/web-server-service.interface.js';
import type { IWorktreeService } from '../../../application/ports/output/services/worktree-service.interface.js';
import { WorktreeService } from '../../services/git/worktree.service.js';
import type { IGitCommitService } from '../../../application/ports/output/services/git-commit.service.interface.js';
import { GitCommitService } from '../../services/git/git-commit.service.js';
import type { IFileSystemService } from '../../../application/ports/output/services/file-system-service.interface.js';
import { FileSystemService } from '../../services/file-system.service.js';
import type { IApplicationBriefStore } from '../../../application/ports/output/services/application-brief-store.interface.js';
import { ApplicationBriefStore } from '../../services/filesystem/application-brief.store.js';
import type { IProjectScaffoldService } from '../../../application/ports/output/services/project-scaffold-service.interface.js';
import { FsProjectScaffoldService } from '../../services/project-scaffold/fs-project-scaffold.service.js';
import type { IApplicationScaffolder } from '../../../application/ports/output/services/application-scaffolder.interface.js';
import { BunShadcnScaffolder } from '../../services/scaffolding/bun-shadcn-scaffolder.service.js';
import type { IAttachmentStorage } from '../../../application/ports/output/services/attachment-storage.interface.js';
import { LocalAttachmentStorageService } from '../../services/storage/local-attachment-storage.service.js';
import type { IWebhookService } from '../../../application/ports/output/services/webhook.interface.js';
import { NoopWebhookService } from '../../services/integrations/noop-webhook.service.js';
import type Database from 'better-sqlite3';
import nodePath from 'node:path';
import type { IApplicationCreationPromptBuilder } from '../../../application/ports/output/services/application-creation-prompt-builder.interface.js';
import { ApplicationCreationPromptBuilder } from '../../services/agents/application-creation/application-creation-prompt.builder.js';
import type { IAgentAuthDetectorService } from '../../../application/ports/output/services/agent-auth-detector.interface.js';
import { PlatformAgentAuthDetectorService } from '../../services/agent-auth-detector/platform-agent-auth-detector.service.js';
import type { IToolInstallerService } from '../../../application/ports/output/services/tool-installer.service.js';
import { ToolInstallerServiceImpl } from '../../services/tool-installer/tool-installer.service.js';
import type { IGitPrService } from '../../../application/ports/output/services/git-pr-service.interface.js';
import { GitPrService } from '../../services/git/git-pr.service.js';
import type { IGitForkService } from '../../../application/ports/output/services/git-fork-service.interface.js';
import { GitForkService } from '../../services/git/git-fork.service.js';
import type { ISkillInjectorService } from '../../../application/ports/output/services/skill-injector.interface.js';
import { SkillInjectorService } from '../../services/skill-injector.service.js';
import type { IBedrockIntegrationService } from '../../../application/ports/output/services/bedrock-integration.service.js';
import { BedrockIntegrationService } from '../../services/integrations/bedrock-integration.service.js';
import type { IBedrockMemoryReader } from '../../../application/ports/output/services/bedrock-memory-reader.interface.js';
import { FileSystemBedrockMemoryReader } from '../../services/integrations/file-system-bedrock-memory-reader.service.js';
import type { IClaudeSettingsReconciler } from '../../../application/ports/output/services/claude-settings-reconciler.service.js';
import { ClaudeSettingsReconciler } from '../../services/filesystem/claude-settings-reconciler.service.js';
import {
  IBedrockIntegrationServiceToken,
  IBedrockMemoryReaderToken,
  IClaudeSettingsReconcilerToken,
} from '../tokens.js';
import type { IGitHubRepositoryService } from '../../../application/ports/output/services/github-repository-service.interface.js';
import { GitHubRepositoryService } from '../../services/external/github-repository.service.js';
import type { IBrowserOpener } from '../../../application/ports/output/services/i-browser-opener.js';
import { BrowserOpenerService } from '../../services/browser-opener.service.js';
import type { ITerminalSessionService } from '../../../application/ports/output/services/terminal-session-service.interface.js';
import { PtyTerminalSessionService } from '../../services/terminal/pty-terminal-session.service.js';
import type { IApplicationFileSystemService } from '../../../application/ports/output/services/application-file-system-service.interface.js';
import { NodeApplicationFileSystemService } from '../../services/filesystem/node-application-file-system.service.js';
import { AttachmentStorageService } from '../../services/attachment-storage.service.js';
import type { IShepInstanceService } from '../../../application/ports/output/services/shep-instance-service.interface.js';
import { ShepInstanceService } from '../../services/shep-instance.service.js';
import type { INotificationService } from '../../../application/ports/output/services/notification-service.interface.js';
import type { IWhatsAppNotifier } from '../../../application/ports/output/services/whatsapp-notifier.interface.js';
import { DesktopNotifier } from '../../services/notifications/desktop-notifier.js';
import { NotificationService } from '../../services/notifications/notification.service.js';
import { getNotificationBus } from '../../services/notifications/notification-bus.js';
import type { IConflictResolutionService } from '../../../application/ports/output/services/conflict-resolution.interface.js';
import { ConflictResolutionService } from '../../services/agents/conflict-resolution/conflict-resolution.service.js';
import type { ILogger } from '../../../application/ports/output/services/logger.interface.js';
import { ConsoleLogger } from '../../services/logging/console-logger.js';
import type { IOperationLogService } from '../../../application/ports/output/services/operation-log-service.interface.js';
import { OperationLogService } from '../../services/operation-log/operation-log.service.js';
import type { IProcessLivenessProbe } from '../../../application/ports/output/services/process-liveness.interface.js';
import { ProcessLivenessAdapter } from '../../services/process/process-liveness.adapter.js';
import type { IProjectBuildService } from '../../../application/ports/output/services/project-build-service.interface.js';
import { NodeProjectBuildService } from '../../services/build/node-project-build.service.js';
import type { IOperationLogEventBus } from '../../../application/ports/output/services/operation-log-event-bus.interface.js';
import { InMemoryOperationLogEventBus } from '../../services/events/in-memory-operation-log-event-bus.js';

// Code review (feature 090) services
import type { IPlatformReviewService } from '../../../application/ports/output/services/platform-review-service.interface.js';
import { GitHubReviewService } from '../../services/code-review/github-review.service.js';
import { annotateFileDiffs } from '../../services/code-review/diff-annotation.service.js';
import { buildReviewPrompt } from '../../services/code-review/review-prompt-builder.service.js';
import { parseReviewOutput } from '../../services/code-review/review-output-parser.service.js';

// Collaboration (feature 093) — agent message bus
import type { IAgentMessageBus } from '../../../application/ports/output/agents/agent-message-bus.interface.js';
import { SQLiteAgentMessageBus } from '../../services/agents/agent-message-bus/sqlite-agent-message-bus.js';
import type { IDeferredQuestionRegistry } from '../../../application/ports/output/agents/agent-question-service.interface.js';
import { DeferredQuestionRegistry } from '../../services/agents/agent-question-service/deferred-question-registry.js';

// Contributor onboarding (feature 097) — output ports + adapters
import type { IGitHubIssueWriter } from '../../../application/ports/output/services/github-issue-writer.interface.js';
import { GitHubIssueWriter } from '../../services/external/github-issue-writer.service.js';
import type { IExternalIssueFetcher } from '../../../application/ports/output/services/external-issue-fetcher.interface.js';
import { GitHubIssueFetcher } from '../../services/external/github-issue.service.js';
import type { IAllContributorsWriter } from '../../../application/ports/output/services/all-contributors-writer.interface.js';
import { AllContributorsWriter } from '../../services/contributors/all-contributors-writer.service.js';
import type { IContributorActionGate } from '../../../application/ports/output/services/contributor-action-gate.interface.js';
import { SupervisorContributorActionGate } from '../../services/contributors/supervisor-contributor-action-gate.js';
import type { IOutreachPublisher } from '../../../application/ports/output/services/outreach-publisher.interface.js';
import { DiscordOutreachPublisher } from '../../services/outreach/discord-outreach-publisher.service.js';
import type { IRecapPublisher } from '../../../application/ports/output/services/recap-publisher.interface.js';
import { FileRecapPublisher } from '../../services/recap/file-recap-publisher.service.js';
import { DiscordRecapPublisher } from '../../services/recap/discord-recap-publisher.service.js';
import { GithubDiscussionRecapPublisher } from '../../services/recap/github-discussion-recap-publisher.service.js';
import type {
  IDiagnostic,
  IDiagnosticRunner,
} from '../../../application/ports/output/services/diagnostic.interface.js';
import { DiagnosticRunner } from '../../services/doctor/diagnostic-runner.service.js';
import { NodeVersionDiagnostic } from '../../../application/use-cases/doctor/diagnostics/node-version.diagnostic.js';
import { PnpmInstalledDiagnostic } from '../../../application/use-cases/doctor/diagnostics/pnpm-installed.diagnostic.js';
import { GitInstalledDiagnostic } from '../../../application/use-cases/doctor/diagnostics/git-installed.diagnostic.js';
import { GhCliAuthDiagnostic } from '../../../application/use-cases/doctor/diagnostics/gh-cli-auth.diagnostic.js';
import { AgentCliAvailabilityDiagnostic } from '../../../application/use-cases/doctor/diagnostics/agent-cli-availability.diagnostic.js';
import { DotenvPresenceDiagnostic } from '../../../application/use-cases/doctor/diagnostics/dotenv-presence.diagnostic.js';
import { WorkingTreeCleanDiagnostic } from '../../../application/use-cases/doctor/diagnostics/working-tree-clean.diagnostic.js';
import { MigrationStatusDiagnostic } from '../../../application/use-cases/doctor/diagnostics/migration-status.diagnostic.js';
import { TypespecFreshnessDiagnostic } from '../../../application/use-cases/doctor/diagnostics/typespec-freshness.diagnostic.js';
import { DiGraphValidationDiagnostic } from '../../../application/use-cases/doctor/diagnostics/di-graph-validation.diagnostic.js';
import { RecapChannel } from '../../../domain/generated/output.js';

/**
 * Register core infrastructure services: validators, filesystem, git, notifications,
 * logger, tool installer, attachment storage, shep-instance, browser opener, etc.
 *
 * Does NOT register services that need eager construction (e.g. deployment service)
 * or that live in topic-specific modules (agents, cloud deploy, ide/tools).
 */
export function registerServices(container: DependencyContainer): void {
  // ExecFunction — on Windows, agent CLIs ship as .cmd/.ps1 scripts (e.g. cursor's
  // `agent.cmd`). execFile without shell: true cannot resolve .cmd extensions,
  // causing ENOENT. With shell: true, Node concatenates `file + ' ' + args.join(' ')`
  // and hands it to cmd.exe — which then re-tokenises on whitespace, splitting any
  // arg containing a space (e.g. `--description "snake game"` would arrive at gh
  // as two args). Quote args with whitespace or shell-special chars before joining.
  const execFileAsync = promisify(execFile);
  const quoteWindowsArg = (a: string): string => {
    if (/^[A-Za-z0-9_./:=+@,-]+$/.test(a)) return a;
    return `"${a.replace(/(["\\])/g, '\\$1')}"`;
  };
  const execFn = IS_WINDOWS
    ? (file: string, args: string[], options?: object) =>
        execFileAsync(file, args.map(quoteWindowsArg), {
          ...options,
          shell: true,
          windowsHide: true,
        })
    : execFileAsync;
  container.registerInstance('ExecFunction', execFn);

  container.registerSingleton<IAgentValidator>('IAgentValidator', AgentValidatorService);
  container.registerSingleton<IVersionService>('IVersionService', VersionService);

  // IWebServerService is registered as a lazy proxy to avoid importing `next`
  // (~80ms) for non-web commands. The actual service is loaded on first method call.
  container.register<IWebServerService>('IWebServerService', {
    useFactory: () => {
      let instance: IWebServerService | null = null;
      const getInstance = async (): Promise<IWebServerService> => {
        if (!instance) {
          const { WebServerService } = await import('../../services/web-server.service.js');
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
  container.registerSingleton<IGitCommitService>('IGitCommitService', GitCommitService);
  container.registerSingleton<IFileSystemService>('IFileSystemService', FileSystemService);
  container.registerSingleton<IApplicationBriefStore>(
    'IApplicationBriefStore',
    ApplicationBriefStore
  );
  container.registerSingleton<IProjectScaffoldService>(
    'IProjectScaffoldService',
    FsProjectScaffoldService
  );
  container.registerSingleton<IApplicationScaffolder>(
    'IApplicationScaffolder',
    BunShadcnScaffolder
  );
  container.registerSingleton<IWebhookService>('IWebhookService', NoopWebhookService);
  container.register<IAttachmentStorage>('IAttachmentStorage', {
    useFactory: (c) => {
      const db = c.resolve<Database.Database>('Database');
      const dbFilename = db.name;
      const dbDir = dbFilename ? nodePath.dirname(dbFilename) : '.shep';
      const storagePath = nodePath.join(dbDir, 'attachments');
      return new LocalAttachmentStorageService(storagePath);
    },
  });
  container.registerSingleton<IApplicationCreationPromptBuilder>(
    'IApplicationCreationPromptBuilder',
    ApplicationCreationPromptBuilder
  );
  container.registerSingleton<IAgentAuthDetectorService>(
    'IAgentAuthDetectorService',
    PlatformAgentAuthDetectorService
  );
  container.registerSingleton<ISkillInjectorService>('ISkillInjectorService', SkillInjectorService);

  // ─── Bedrock integration (feature 098) ──────────────────────────────
  // Reconciler is registered first so the bedrock adapter (or any future
  // consumer) can resolve it without a forward-reference. Both are infra
  // services — singletons, string-token aliased through tokens.ts.
  container.registerSingleton<IClaudeSettingsReconciler>(
    IClaudeSettingsReconcilerToken,
    ClaudeSettingsReconciler
  );
  container.registerSingleton<IBedrockIntegrationService>(
    IBedrockIntegrationServiceToken,
    BedrockIntegrationService
  );
  container.registerSingleton<IBedrockMemoryReader>(
    IBedrockMemoryReaderToken,
    FileSystemBedrockMemoryReader
  );
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
  container.register('IAttachmentStorageService', { useToken: AttachmentStorageService });
  container.registerSingleton<IShepInstanceService>('IShepInstanceService', ShepInstanceService);

  // Notification services
  const notificationBus = getNotificationBus();
  container.registerInstance('NotificationEventBus', notificationBus);

  container.register('DesktopNotifier', {
    useFactory: () => new DesktopNotifier(),
  });
  container.register('IDesktopNotifier', {
    useFactory: (c) => c.resolve('DesktopNotifier') as DesktopNotifier,
  });

  container.register<INotificationService>('INotificationService', {
    useFactory: (c) => {
      const bus = c.resolve('NotificationEventBus') as ReturnType<typeof getNotificationBus>;
      const desktopNotif = c.resolve('DesktopNotifier') as DesktopNotifier;
      // WhatsApp is an optional outbound channel (spec 101). Resolved lazily so
      // its absence (or the registration module not having run) is harmless.
      const whatsAppNotifier = c.isRegistered('IWhatsAppNotifier')
        ? (c.resolve('IWhatsAppNotifier') as IWhatsAppNotifier)
        : undefined;
      return new NotificationService(bus, desktopNotif, whatsAppNotifier);
    },
  });

  // Browser opener
  container.register<IBrowserOpener>('IBrowserOpener', {
    useFactory: () => new BrowserOpenerService(),
  });

  // Conflict resolution (shared by several feature use cases)
  container.registerSingleton<IConflictResolutionService>(
    'IConflictResolutionService',
    ConflictResolutionService
  );

  // Generic logger used by cloud deploy + other infrastructure consumers.
  container.registerSingleton<ILogger>('ILogger', ConsoleLogger);

  // Operation log service — orchestrating use cases append structured progress
  // entries here so the UI can render full operation history. Lazy-resolved so
  // the IOperationLogRepository (registered in register-repositories) is in
  // place by the time the first use case asks for the service.
  container.registerSingleton<IOperationLogService>('IOperationLogService', OperationLogService);

  // Operation log event bus — SQLite repo publishes here after each
  // successful append; SSE route subscribes to fan out as notifications.
  container.registerSingleton<IOperationLogEventBus>(
    'IOperationLogEventBus',
    InMemoryOperationLogEventBus
  );

  // Process liveness probe — hides `process.kill(pid, 0)` behind a port so
  // application + presentation layers never import `infrastructure/services/
  // process/is-process-alive` directly.
  container.registerSingleton<IProcessLivenessProbe>(
    'IProcessLivenessProbe',
    ProcessLivenessAdapter
  );

  container.registerSingleton<IProjectBuildService>(
    'IProjectBuildService',
    NodeProjectBuildService
  );

  // ─── Code review (feature 090) services ─────────────────────────────
  container.registerSingleton<IPlatformReviewService>(
    'IPlatformReviewService',
    GitHubReviewService
  );
  container.registerInstance('DiffAnnotator', annotateFileDiffs);
  container.registerInstance('PromptBuilder', buildReviewPrompt);
  container.registerInstance('OutputParser', parseReviewOutput);

  // ─── Collaboration (feature 093) — agent message bus ────────────────
  // SQLite-backed bus reuses the shared shep.db so the bus is cross-process
  // by virtue of the WAL-mode database file. Singleton so subscriptions
  // share one poll loop per process (research decision 2).
  container.registerSingleton<IAgentMessageBus>('IAgentMessageBus', SQLiteAgentMessageBus);

  // ─── Collaboration (feature 093) — deferred question registry ───────
  // In-process bridge between the SDK V2 canUseTool callback and the
  // DB-backed answer that may arrive from another process. Singleton so
  // every use case in this process shares one map of awaiters (task 16).
  container.registerSingleton<IDeferredQuestionRegistry>(
    'IDeferredQuestionRegistry',
    DeferredQuestionRegistry
  );

  // ─── Contributor onboarding (feature 097) — writers & publishers ────
  // Workspace root resolution mirrors `ShepInstanceService` so the file-based
  // adapters (all-contributors, file recap) write into the correct repo when
  // Shep runs against a checked-out target instance.
  const workspaceRoot =
    process.env.SHEP_INSTANCE_PATH ?? process.env.NEXT_PUBLIC_SHEP_INSTANCE_PATH ?? process.cwd();

  // GitHubIssueWriter takes two function-typed constructor params with
  // sensible defaults (see DiscordOutreachPublisher note below) — register
  // an instance so tsyringe never tries to reflect on `Function`.
  container.registerInstance<IGitHubIssueWriter>('IGitHubIssueWriter', new GitHubIssueWriter());
  container.registerSingleton<IExternalIssueFetcher>('IExternalIssueFetcher', GitHubIssueFetcher);
  container.register<IAllContributorsWriter>('IAllContributorsWriter', {
    useFactory: () => new AllContributorsWriter(workspaceRoot),
  });
  // DiscordOutreachPublisher's constructor takes two function-typed
  // parameters with sensible defaults. tsyringe cannot reflect on function
  // types (reflect-metadata emits `Function`), so `registerSingleton(...)`
  // crashes with "TypeInfo not known for Function". Register the concrete
  // instance directly so the default args are used.
  container.registerInstance<IOutreachPublisher>(
    'IOutreachPublisher',
    new DiscordOutreachPublisher()
  );

  // Contributor action gate (NFR-5) — every contributor side-effect flows
  // through the supervisor before execution.
  container.registerSingleton<IContributorActionGate>(
    'IContributorActionGate',
    SupervisorContributorActionGate
  );

  // Recap publishers are registered per-channel so the publish use case can
  // resolve the right adapter for a given target. Each publisher is ALSO
  // registered under the bare `IRecapPublisher` token so `@injectAll(...)`
  // in `PublishMonthlyRecapUseCase` picks up the full set.
  const registerRecapPublisher = (
    channel: RecapChannel,
    factory: (c: DependencyContainer) => IRecapPublisher
  ): void => {
    container.register<IRecapPublisher>(`IRecapPublisher:${channel}`, { useFactory: factory });
    container.register<IRecapPublisher>('IRecapPublisher', { useFactory: factory });
  };
  registerRecapPublisher(RecapChannel.File, () => new FileRecapPublisher(workspaceRoot));
  registerRecapPublisher(
    RecapChannel.Discord,
    (c) => new DiscordRecapPublisher(c.resolve<IOutreachPublisher>('IOutreachPublisher'))
  );
  // GithubDiscussionRecapPublisher also has a function-typed default-arg
  // constructor; instantiate it directly to bypass tsyringe reflection.
  registerRecapPublisher(RecapChannel.GithubDiscussion, () => new GithubDiscussionRecapPublisher());

  container.registerSingleton<IDiagnosticRunner>('IDiagnosticRunner', DiagnosticRunner);

  // ─── Doctor diagnostics (feature 097, phase 3) ──────────────────────
  // Each diagnostic is a strategy resolved by string token. The use case
  // injects the array via `resolveAll('IDiagnostic')`. Order is the
  // declaration order below — that's the order they are reported in.
  const registerDiagnostic = (factory: (c: DependencyContainer) => IDiagnostic) =>
    container.register<IDiagnostic>('IDiagnostic', { useFactory: factory });

  registerDiagnostic(() => new NodeVersionDiagnostic());
  registerDiagnostic(() => new PnpmInstalledDiagnostic());
  registerDiagnostic(() => new GitInstalledDiagnostic());
  registerDiagnostic((c) => c.resolve(GhCliAuthDiagnostic));
  registerDiagnostic((c) => c.resolve(AgentCliAvailabilityDiagnostic));
  registerDiagnostic(
    (c) =>
      new DotenvPresenceDiagnostic(
        c.resolve<IFileSystemService>('IFileSystemService'),
        workspaceRoot
      )
  );
  registerDiagnostic(
    (c) => new WorkingTreeCleanDiagnostic(c.resolve<IGitPrService>('IGitPrService'), workspaceRoot)
  );
  registerDiagnostic((c) => c.resolve(MigrationStatusDiagnostic));
  registerDiagnostic(
    (c) =>
      new TypespecFreshnessDiagnostic(
        c.resolve<IFileSystemService>('IFileSystemService'),
        workspaceRoot
      )
  );
  registerDiagnostic((c) => new DiGraphValidationDiagnostic((token) => c.isRegistered(token)));
}
