/**
 * DI string tokens for the query-aware harness ports (spec 119).
 *
 * Defined next to the ports (not in infrastructure) so application services
 * can `@inject(HARNESS_TOKENS.X)` without importing infrastructure. Tokens
 * equal the interface names, matching the rest of the container.
 */
export const HARNESS_TOKENS = {
  BlobStore: 'IHarnessBlobStore',
  EventLog: 'IHarnessEventLog',
  SessionRepository: 'IHarnessSessionRepository',
  ContextRepository: 'IHarnessContextRepository',
  ExecutionRepository: 'IHarnessExecutionRepository',
  PermissionRepository: 'IHarnessPermissionRepository',
  EvalRepository: 'IHarnessEvalRepository',
  RepoSnapshotter: 'IRepoSnapshotter',
  DecisionProviderFactory: 'IDecisionProviderFactory',
  ToolSources: 'IHarnessToolSources',
  ToolArgumentValidator: 'IToolArgumentValidator',
  PolicyEngine: 'IHarnessPolicyEngine',
  CommandInspector: 'ICommandInspector',
  InstructionSource: 'IInstructionSource',
  ModelProviderFactory: 'IHarnessModelProviderFactory',
  Runtime: 'HarnessRuntime',
  TaskService: 'HarnessTaskService',
  WorkspaceService: 'IHarnessWorkspaceService',
  ProjectSetup: 'IHarnessProjectSetup',
  EnvironmentProbe: 'IHarnessEnvironmentProbe',
  EvalSuiteSource: 'IHarnessEvalSuiteSource',
  EvalWorkspaceFactory: 'IHarnessEvalWorkspaceFactory',
  /** OS process id of this shep process (recorded on tasks and eval runs). */
  ProcessId: 'HarnessProcessId',
} as const;
