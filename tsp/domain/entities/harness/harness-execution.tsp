/**
 * @module Shep.Domain.Entities.Harness.Execution
 *
 * Decisions, model calls, capabilities, tool calls and permissions of the
 * query-aware harness (spec 119). Every write or side-effect tool call carries
 * a persisted PermissionDecision; AI judgment and user grants can never lift a
 * hard deny.
 */
import "../../../common/base.tsp";
import "../../../common/enums/harness.tsp";

@doc("A persisted, typed decision made by a decision provider")
model HarnessDecision extends BaseEntity {
  @doc("Task the decision belongs to")
  taskId?: string;

  @doc("Decision kind")
  kind: HarnessDecisionKind;

  @doc("Configured provider id that answered")
  providerId: string;

  @doc("Provider implementation family")
  providerKind: DecisionProviderKind;

  @doc("Model the provider used, if any")
  `model`?: string;

  @doc("Short question the decision answered")
  question: string;

  @doc("Blob reference of the full decision input")
  inputRef: string;

  @doc("Decision result")
  result: Record<unknown>;

  @doc("Alternatives with scores or probabilities, when available")
  alternatives?: Record<unknown>[];

  @doc("Confidence between 0 and 1, when available")
  confidence?: float64;

  @doc("Latency in milliseconds")
  latencyMs: int32;

  @doc("Estimated cost in USD, when known")
  estimatedCostUsd?: float64;

  @doc("Whether the result was enforced")
  enforced: boolean;

  @doc("Computed in shadow mode; never enforced")
  shadow: boolean;

  @doc("A fallback provider answered because the routed one failed")
  degraded: boolean;

  @doc("Providers that failed before this one answered")
  failedProviders?: string[];

  @doc("Context plan the decision fed, if any")
  contextPlanId?: string;
}

@doc("One call to the coding model")
model ModelCall extends BaseEntity {
  @doc("Task")
  taskId: string;

  @doc("Turn number (1-based)")
  turn: int32;

  @doc("Model id")
  modelId: string;

  @doc("Context plan the input was materialized from (query-aware mode)")
  contextPlanId?: string;

  @doc("Status")
  status: ModelCallStatus;

  @doc("Provider-reported input tokens (including cached)")
  inputTokens?: int32;

  @doc("Provider-reported output tokens")
  outputTokens?: int32;

  @doc("Provider-reported cached input tokens (counted once, inside inputTokens)")
  cachedInputTokens?: int32;

  @doc("Cost in USD when the provider reports it")
  costUsd?: float64;

  @doc("Latency in milliseconds")
  latencyMs?: int32;

  @doc("Estimated tokens of the materialized input")
  estimatedInputTokens: int32;

  @doc("Chunk holding the model response")
  responseChunkId?: string;

  @doc("Finish reason reported by the provider")
  finishReason?: string;

  @doc("Error message when the call failed")
  error?: string;
}

@doc("What can be done, independent of how (Tier-1 is the snippet)")
model Capability {
  @doc("Stable id, e.g. search_source_code")
  id: string;

  @doc("Title")
  title: string;

  @doc("Tier-1 snippet; always cheap")
  snippet: string;

  @doc("Tags for candidate retrieval")
  tags: string[];

  @doc("Risk class")
  risk: RiskClass;

  @doc("Implementations satisfying the capability")
  implementationIds: string[];
}

@doc("A concrete tool satisfying a capability (Tier-2 schema, optional Tier-3 docs)")
model ToolImplementation {
  @doc("Stable id, e.g. builtin.search_source")
  id: string;

  @doc("Capability satisfied")
  capabilityId: string;

  @doc("Source of the implementation")
  source: ToolSourceKind;

  @doc("Tool name exposed to the model once its schema is loaded")
  toolName: string;

  @doc("Snippet")
  snippet: string;

  @doc("JSON Schema of the arguments (Tier-2)")
  inputSchema: Record<unknown>;

  @doc("Long-form docs (Tier-3), loaded only on demand")
  docs?: string;

  @doc("Risk class")
  risk: RiskClass;

  @doc("Read, write or side effect")
  readWriteMode: ToolReadWriteMode;
}

@doc("One tool execution with its permission record")
model HarnessToolCall extends BaseEntity {
  @doc("Task")
  taskId: string;

  @doc("Turn number (1-based)")
  turn: int32;

  @doc("Capability")
  capabilityId: string;

  @doc("Implementation")
  implementationId: string;

  @doc("Validated arguments")
  arguments: Record<unknown>;

  @doc("SHA-256 of the canonical arguments")
  argumentsHash: string;

  @doc("Idempotency key (task + turn + arguments hash)")
  idempotencyKey: string;

  @doc("Permission decision that allowed or denied the call")
  permissionDecisionId?: string;

  @doc("Status")
  status: HarnessToolCallStatus;

  @doc("Chunk holding the raw output (persisted before rendering)")
  rawOutputChunkId?: string;

  @doc("Short status line for UIs")
  summary?: string;

  @doc("When execution started")
  startedAt?: utcDateTime;

  @doc("When execution finished")
  completedAt?: utcDateTime;
}

@doc("A normalized action under permission evaluation")
model ActionDescriptor {
  @doc("Capability id")
  capabilityId: string;

  @doc("Read, write or side effect")
  actionClass: ToolReadWriteMode;

  @doc("Human summary, e.g. the command line")
  summary: string;

  @doc("Agent's stated reason for the action")
  intent?: string;
}

@doc("A resource an action touches")
model ResourceDescriptor {
  @doc("Kind of resource: path, host, remote, process")
  kind: string;

  @doc("Resource value (absolute path, host name, …)")
  value: string;

  @doc("Access: read, write, delete, connect, execute")
  access: string;

  @doc("Whether the resource lies outside the repository/worktree")
  outsideRepo: boolean;
}

@doc("A predicted effect of an action, phrased for a person")
model EffectDescriptor {
  @doc("Effect category: network, write, delete, dependency, git_push, script, privilege, secret, unknown")
  category: string;

  @doc("Sentence shown in the permission prompt")
  description: string;
}

@doc("The persisted permission result for one action")
model PermissionDecision extends BaseEntity {
  @doc("Task")
  taskId: string;

  @doc("Session")
  sessionId: string;

  @doc("Tool call this decision gates")
  toolCallId?: string;

  @doc("Action")
  action: ActionDescriptor;

  @doc("Resources touched")
  resources: ResourceDescriptor[];

  @doc("Predicted effects")
  effects: EffectDescriptor[];

  @doc("Final (or pending) effect")
  result: PermissionEffect;

  @doc("Pending while waiting for a person")
  status: PermissionRequestStatus;

  @doc("Deterministic policy rule ids that matched")
  matchedRuleIds: string[];

  @doc("Whether a matched rule is hard (never approvable)")
  hard: boolean;

  @doc("Shadow AI risk decision, if any (never enforced in V0)")
  aiDecisionId?: string;

  @doc("Reason code, e.g. policy_match, grant, approval_timeout, user")
  reasonCode: string;

  @doc("Who resolved it: policy, grant, user, timeout, non_interactive")
  resolvedBy?: string;

  @doc("Grant scope chosen by the user")
  scope?: GrantScope;

  @doc("Note from the user returned to the agent with the decision")
  note?: string;
}

@doc("A temporary user grant; hard policy still wins")
model PermissionGrant extends BaseEntity {
  @doc("Session")
  sessionId: string;

  @doc("Task, for task-scoped grants")
  taskId?: string;

  @doc("Scope")
  scope: GrantScope;

  @doc("Capability id the grant covers")
  capabilityId: string;

  @doc("Normalized action summary the grant covers (e.g. the command)")
  actionPattern: string;

  @doc("Whether the once-grant was consumed")
  consumed: boolean;
}
