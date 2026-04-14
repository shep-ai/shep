/**
 * Agent Output Ports
 *
 * Interfaces for agent execution, orchestration, and persistence.
 */

export type {
  IAgentExecutor,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
  AgentExecutionOptions,
} from './agent-executor.interface.js';
export type { IAgentExecutorFactory, AgentCliInfo } from './agent-executor-factory.interface.js';
export type { IAgentExecutorProvider } from './agent-executor-provider.interface.js';
export type { IAgentRegistry, AgentDefinitionWithFactory } from './agent-registry.interface.js';
export type { IAgentRunner, AgentRunOptions } from './agent-runner.interface.js';
export type { IAgentRunRepository } from './agent-run-repository.interface.js';
export type { IPhaseTimingRepository } from './phase-timing-repository.interface.js';
export type { IAgentValidator, AgentValidationResult } from './agent-validator.interface.js';
export type { IFeatureAgentProcessService } from './feature-agent-process.interface.js';
export type {
  IStructuredAgentCaller,
  StructuredCallOptions,
} from './structured-agent-caller.interface.js';
export { StructuredCallError } from './structured-call-error.js';
export type {
  IAgentSessionRepository,
  ListSessionsOptions,
  GetSessionOptions,
} from './agent-session-repository.interface.js';
export type { IAgentSessionRepositoryRegistry } from './agent-session-repository-registry.interface.js';
export type {
  IInteractiveAgentExecutor,
  InteractiveAgentOptions,
  InteractiveAgentEvent,
  InteractiveAgentSessionHandle,
} from './interactive-agent-executor.interface.js';
export type { CatalogEntry } from './model-catalog.types.js';
