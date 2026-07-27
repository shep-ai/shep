/**
 * Application Output Ports Module
 *
 * Exports all output port interfaces organized by domain:
 * - agents/       — Agent execution, orchestration, and persistence
 * - repositories/ — Data access and persistence
 * - services/     — External services and integrations
 */

// Agent ports
export type {
  IAgentExecutor,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
  AgentExecutionOptions,
  IAgentExecutorFactory,
  IAgentExecutorProvider,
  IAgentRegistry,
  AgentDefinitionWithFactory,
  IAgentRunner,
  AgentRunOptions,
  IAgentRunRepository,
  IAgentValidator,
  AgentValidationResult,
  IFeatureAgentProcessService,
} from './agents/index.js';

// Repository ports
export type {
  IFeatureRepository,
  FeatureListFilters,
  ISettingsRepository,
} from './repositories/index.js';

// Service ports
export type {
  IExternalIssueFetcher,
  ExternalIssue,
  INotificationService,
  ISpecInitializerService,
  SpecInitializerResult,
  IVersionService,
  IWebServerService,
  IWorktreeService,
  WorktreeInfo,
  IWorktreeHookRunner,
  WorktreeHookContext,
} from './services/index.js';
export {
  IssueFetcherError,
  IssueNotFoundError,
  IssueAuthenticationError,
  IssueServiceUnavailableError,
  WorktreeError,
  WorktreeErrorCode,
} from './services/index.js';
