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
export type {
  IPromptOptimizerService,
  PromptOptimizationContext,
  PromptOptimizationResult,
  OptimizationMetrics,
} from './prompt-optimizer.interface.js';
export type {
  ICommandOutputFilterService,
  CommandOutputFilterResult,
  OutputFilterPolicyType,
} from './command-output-filter.interface.js';
export type { ISkillRoutingService, SkillRoutingResult } from './skill-routing.interface.js';
export type {
  IDeltaContextService,
  DeltaContextResult,
  SpecFileEntry,
} from './delta-context.interface.js';
export type {
  ISemanticCompressorService,
  SemanticCompressionResult,
} from './semantic-compressor.interface.js';
export type {
  IAliasCompressionService,
  AliasCompressionResult,
} from './alias-compression.interface.js';
export type { IOptimizationMetricsService } from './optimization-metrics.interface.js';
