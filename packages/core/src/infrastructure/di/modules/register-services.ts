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

  container.register<INotificationService>('INotificationService', {
    useFactory: (c) => {
      const bus = c.resolve('NotificationEventBus') as ReturnType<typeof getNotificationBus>;
      const desktopNotif = c.resolve('DesktopNotifier') as DesktopNotifier;
      return new NotificationService(bus, desktopNotif);
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

  // Process liveness probe — hides `process.kill(pid, 0)` behind a port so
  // application + presentation layers never import `infrastructure/services/
  // process/is-process-alive` directly.
  container.registerSingleton<IProcessLivenessProbe>(
    'IProcessLivenessProbe',
    ProcessLivenessAdapter
  );
}
