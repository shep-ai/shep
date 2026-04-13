/**
 * Service Output Ports
 *
 * Interfaces for external services and integrations.
 */

export type { IExternalIssueFetcher, ExternalIssue } from './external-issue-fetcher.interface.js';
export {
  IssueFetcherError,
  IssueNotFoundError,
  IssueAuthenticationError,
  IssueServiceUnavailableError,
} from './external-issue-fetcher.interface.js';
export type {
  ISpecInitializerService,
  SpecInitializerResult,
} from './spec-initializer.interface.js';
export type { ISpecArtifactParser } from './spec-artifact-parser.interface.js';
export type { IVersionService } from './version-service.interface.js';
export type { IWebServerService } from './web-server-service.interface.js';
export type { IWorktreeService, WorktreeInfo } from './worktree-service.interface.js';
export { WorktreeError, WorktreeErrorCode } from './worktree-service.interface.js';
export type { IToolInstallerService, AvailableTerminalEntry } from './tool-installer.service.js';
export type { INotificationService } from './notification-service.interface.js';
export type {
  IGitPrService,
  CiStatus,
  CiStatusResult,
  DiffSummary,
  MergeStrategy,
  PrCreateResult,
} from './git-pr-service.interface.js';
export { GitPrError, GitPrErrorCode } from './git-pr-service.interface.js';
export type {
  IIdeLauncherService,
  LaunchIdeInput,
  LaunchIdeResult,
  LaunchIdeSuccess,
  LaunchIdeFailed,
} from './ide-launcher-service.interface.js';
export type { IDaemonService, DaemonState } from './daemon-service.interface.js';
export type { IDeploymentService, DeploymentStatus } from './deployment-service.interface.js';
export type {
  IGitHubRepositoryService,
  GitHubRepo,
  GitHubOrganization,
  ListUserRepositoriesOptions,
  CloneOptions,
  ParsedGitHubUrl,
} from './github-repository-service.interface.js';
export {
  GitHubAuthError,
  GitHubCloneError,
  GitHubUrlParseError,
  GitHubRepoListError,
} from './github-repository-service.interface.js';
export type {
  IInteractiveSessionService,
  StreamChunk,
  UnsubscribeFn,
  ChatState,
} from './interactive-session-service.interface.js';
export type { ISkillInjectorService, SkillInjectionResult } from './skill-injector.interface.js';
export type { IFileSystemService } from './file-system-service.interface.js';
export type { IApplicationBriefStore } from './application-brief-store.interface.js';
export type {
  IApplicationFileSystemService,
  FileTreeEntry,
  ReadFileResult,
  ReadFileBufferResult,
  FileChangeKind,
  FileChangeEvent,
  FileChangeListener,
  UnsubscribeFn as FileWatchUnsubscribeFn,
} from './application-file-system-service.interface.js';
export { ApplicationFileSystemError } from './application-file-system-service.interface.js';
export type {
  IProjectScaffoldService,
  ScaffoldProjectInput,
  ScaffoldProjectResult,
} from './project-scaffold-service.interface.js';
export type { IAgentAuthDetectorService } from './agent-auth-detector.interface.js';
export type { IDesktopNotifier } from './i-desktop-notifier.js';
export type { IBrowserOpener } from './i-browser-opener.js';
export type {
  ITerminalSessionService,
  CreateTerminalSessionInput,
  CreatedTerminalSession,
  TerminalOutputListener,
  TerminalExitListener,
} from './terminal-session-service.interface.js';
export type { IWorktreePathProvider } from './worktree-path-provider.interface.js';
export type { IToolMetadataProvider, ToolMetadata } from './tool-metadata-provider.interface.js';
export type { IPhaseTimingContext } from './phase-timing-context.interface.js';
export type { IAttachmentStorage } from './attachment-storage.interface.js';
export type {
  IAttachmentStorageService,
  StoredAttachment,
} from './feature-attachment-storage.interface.js';
