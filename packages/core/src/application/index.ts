/**
 * @shepai/core Application Layer
 *
 * Exports all use cases and port interfaces.
 */

// Port interfaces
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
  IFeatureRepository,
  FeatureListFilters,
  ISettingsRepository,
  IExternalIssueFetcher,
  ExternalIssue,
  ISpecInitializerService,
  SpecInitializerResult,
  IVersionService,
  IWebServerService,
  IWorktreeService,
  WorktreeInfo,
  IWorktreeHookRunner,
  WorktreeHookContext,
} from './ports/output/index.js';

export {
  IssueFetcherError,
  IssueNotFoundError,
  IssueAuthenticationError,
  IssueServiceUnavailableError,
  WorktreeError,
  WorktreeErrorCode,
} from './ports/output/index.js';

// Settings use cases
export { InitializeSettingsUseCase } from './use-cases/settings/initialize-settings.use-case.js';
export { LoadSettingsUseCase } from './use-cases/settings/load-settings.use-case.js';
export { UpdateSettingsUseCase } from './use-cases/settings/update-settings.use-case.js';

// Feature use cases
export { ListFeaturesUseCase } from './use-cases/features/list-features.use-case.js';
export { ShowFeatureUseCase } from './use-cases/features/show-feature.use-case.js';
export { CreateFeatureUseCase } from './use-cases/features/create/create-feature.use-case.js';
export { DeleteFeatureUseCase } from './use-cases/features/delete-feature.use-case.js';
export { ResumeFeatureUseCase } from './use-cases/features/resume-feature.use-case.js';
export { UpdateFeaturePinnedConfigUseCase } from './use-cases/features/update-feature-pinned-config.use-case.js';

// Agent use cases
export { RunAgentUseCase } from './use-cases/agents/run-agent.use-case.js';
export { StopAgentRunUseCase } from './use-cases/agents/stop-agent-run.use-case.js';
export { ApproveAgentRunUseCase } from './use-cases/agents/approve-agent-run.use-case.js';
export { RejectAgentRunUseCase } from './use-cases/agents/reject-agent-run.use-case.js';
export { GetAgentRunUseCase } from './use-cases/agents/get-agent-run.use-case.js';
export { ShowAgentRunUseCase } from './use-cases/agents/show-agent-run.use-case.js';
export { ListAgentRunsUseCase } from './use-cases/agents/list-agent-runs.use-case.js';
export { DeleteAgentRunUseCase } from './use-cases/agents/delete-agent-run.use-case.js';
export { ConfigureAgentUseCase } from './use-cases/agents/configure-agent.use-case.js';
export { ValidateAgentAuthUseCase } from './use-cases/agents/validate-agent-auth.use-case.js';
