/**
 * @module Shep.Domain.Entities.Harness.Config
 *
 * Global configuration of the query-aware harness (spec 119), stored on
 * Settings.harness. Per-repository policy and instructions live in
 * `<repo>/.shep/harness/` instead, so they are versioned with the code.
 */
import "../../../common/enums/harness.tsp";
import "../../../common/enums/agent-config.tsp";

@doc("Context budget and visibility bands")
model HarnessContextConfig {
  @doc("Maximum input tokens of a model call")
  maxInputTokens: int32 = 64000;

  @doc("Tokens reserved for the model's output")
  reserveOutputTokens: int32 = 8000;

  @doc("Maximum candidate chunks scored per turn")
  candidateLimit: int32 = 200;

  @doc("Relevance below this is hidden")
  hideThreshold: float64 = 0.1;

  @doc("Relevance from this is long (below it: short)")
  longThreshold: float64 = 0.45;

  @doc("Relevance from this is full")
  fullThreshold: float64 = 0.8;

  @doc("Largest view (tokens) shown in full without an explicit request; bigger chunks get their long view")
  fullTokenCap: int32 = 4000;

  @doc("Visibility used when no provider could score a chunk")
  uncertainDefault: ChunkVisibility = ChunkVisibility.Long;
}

@doc("One configured decision provider instance")
model DecisionProviderConfig {
  @doc("Unique id referenced by routes")
  id: string;

  @doc("Implementation family")
  kind: DecisionProviderKind;

  @doc("HTTP endpoint (openai_compatible, reranker, jev)")
  endpoint?: string;

  @doc("Model name the endpoint should use")
  `model`?: string;

  @doc("Name of the environment variable holding an API key (never the key itself)")
  apiKeyEnv?: string;

  @doc("Per-call timeout in milliseconds")
  timeoutMs?: int32;
}

@doc("Which provider answers each decision kind")
model DecisionRoutes {
  @doc("Provider for chunk visibility")
  chunkVisibility?: string;

  @doc("Provider for capability choice")
  capabilityChoice?: string;

  @doc("Provider for cache strategy")
  cacheStrategy?: string;

  @doc("Provider for (shadow) permission risk")
  permissionRisk?: string;
}

@doc("Pluggable decision layer: Jev is optional and replaceable by open-source providers")
model HarnessDecisionsConfig {
  @doc("Configured providers; 'deterministic' always exists implicitly")
  providers: DecisionProviderConfig[];

  @doc("Per-kind routes")
  routes: DecisionRoutes;

  @doc("Provider for kinds without a route")
  defaultProviderId: string = "deterministic";

  @doc("Ordered fallbacks; deterministic is always appended last")
  fallbackProviderIds: string[];
}

@doc("Shadow (record-only) switches")
model HarnessShadowConfig {
  @doc("Run baseline but record query-aware plans")
  contextRouter: boolean = false;

  @doc("Record AI permission-risk judgments without enforcing them")
  permissions: boolean = false;

  @doc("Record capability-router picks while the model's choice runs")
  toolRouter: boolean = false;
}

@doc("Permission defaults")
model HarnessPermissionsConfig {
  @doc("Effect for actions no rule matches")
  defaultUnknown: PermissionEffect = PermissionEffect.Ask;

  @doc("What 'ask' becomes when nobody can answer (evals, --non-interactive)")
  nonInteractiveAsk: PermissionEffect = PermissionEffect.Deny;

  @doc("How long to wait for a person before denying, in milliseconds")
  approvalTimeoutMs: int32 = 1800000;
}

@doc("Global configuration of the query-aware agent harness (spec 119)")
model HarnessConfig {
  @doc("Context-assembly mode")
  mode: HarnessMode = HarnessMode.QueryAware;

  @doc("Budget mode")
  budgetMode: HarnessBudgetMode = HarnessBudgetMode.Balanced;

  @doc("Maximum model calls per task")
  maxTurns: int32 = 50;

  @doc("SDK agent whose model access (and credentials) the harness reuses")
  backendAgentType: AgentType = AgentType.OpenRouter;

  @doc("Model id on the backend (unset: settings.models.default)")
  backendModel?: string;

  @doc("Context budget and visibility bands")
  context: HarnessContextConfig;

  @doc("Decision layer")
  decisions: HarnessDecisionsConfig;

  @doc("Shadow switches")
  shadow: HarnessShadowConfig;

  @doc("Permission defaults")
  permissions: HarnessPermissionsConfig;
}

@doc("One eval run over a suite: cases × variants × repeats")
model HarnessEvalRun extends BaseEntity {
  @doc("Suite name")
  suite: string;

  @doc("Variants compared")
  variants: HarnessMode[];

  @doc("Repeats per case and variant")
  repeats: int32;

  @doc("Status")
  status: HarnessEvalRunStatus;

  @doc("Model id used by every variant")
  modelId?: string;

  @doc("Error message when the run failed")
  error?: string;
}

@doc("Result of one case × variant × repeat in an eval run")
model HarnessEvalResult extends BaseEntity {
  @doc("Eval run")
  runId: string;

  @doc("Case id")
  caseId: string;

  @doc("Variant")
  variant: HarnessMode;

  @doc("Repeat index (0-based)")
  repeat: int32;

  @doc("Whether the success check passed")
  success: boolean;

  @doc("Metric values (inputTokens, outputTokens, cachedTokens, costUsd, wallMs, turns, repeatedReads, visibleToolTokens, rawToolTokens, recall)")
  scores: Record<float64>;

  @doc("Harness session of the run")
  sessionId?: string;

  @doc("Error message when the case failed to run")
  error?: string;
}
