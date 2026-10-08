import "../../common/base.tsp";

/**
 * Priority tier for fleet triage exceptions.
 */
@doc("Priority tier for fleet triage items")
enum FleetTriagePriority {
  @doc("P1: Blocker requiring immediate decision (gate breached, blocking question, merge conflict)")
  p1: "P1",

  @doc("P2: Failure requiring action or retry (CI failed max retries, process crash)")
  p2: "P2",

  @doc("P3: Advisory warning (stalled, long running, rate limit backoff)")
  p3: "P3",
}

/**
 * Category of triage item.
 */
@doc("Category of fleet triage item")
enum FleetTriageCategory {
  gate: "gate",
  question: "question",
  ci_failed: "ci_failed",
  conflict: "conflict",
  crash: "crash",
  warning: "warning",
}

/**
 * Individual exception item in the fleet triage feed.
 */
@doc("Actionable exception requiring human attention in the fleet triage queue")
model FleetTriageItem {
  @doc("Feature ID")
  featureId: string;

  @doc("Human readable feature name")
  featureName: string;

  @doc("Feature slug identifier")
  slug: string;

  @doc("Priority tier (P1, P2, or P3)")
  priority: FleetTriagePriority;

  @doc("Exception category")
  category: FleetTriageCategory;

  @doc("Human-readable reason for the triage item")
  reason: string;

  @doc("Agent run ID that must be approved or retried, when the item maps to a run")
  runId?: string;

  @doc("Lifecycle gate type (prd, plan, merge) if category is gate")
  gateType?: string;

  @doc("Worktree path")
  worktreePath?: string;

  @doc("Timestamp when this exception was created or observed")
  createdAt: utcDateTime;
}

/**
 * Aggregate counts of features across fleet states.
 */
@doc("Rollup counts across all fleet features")
model FleetStatusCounts {
  @doc("Total features in fleet (active + queued)")
  total: int32;

  @doc("Features running smoothly without blockers")
  cruising: int32;

  @doc("Features that have not started yet (lifecycle = Pending)")
  queued: int32;

  @doc("Features requiring human attention (P1/P2/P3)")
  attentionNeeded: int32;

  @doc("Features in failed or crashed state")
  failed: int32;

  @doc("Features waiting at approval gates")
  waitingApproval: int32;

  @doc("Features with unanswered blocking questions")
  blockedQuestions: int32;
}

/**
 * Overall fleet status snapshot.
 */
@doc("Complete health and triage snapshot of the agent fleet")
model FleetOverview {
  @doc("Aggregated status counts")
  counts: FleetStatusCounts;

  @doc("True if the fleet circuit breaker has tripped")
  circuitBreakerTripped: boolean;

  @doc("Reason why circuit breaker was tripped if active")
  circuitBreakerReason?: string;

  @doc("Present while the fleet admission queue is parked, absent while it is draining")
  queuePaused?: FleetQueuePause;

  @doc("Number of unresolved triage items")
  activeTriageCount: int32;

  @doc("Consecutive failed agent runs observed in the current window")
  consecutiveFailures: int32;

  @doc("Timestamp of this snapshot")
  timestamp: utcDateTime;
}

/**
 * Global settings for the Fleet Circuit Breaker.
 */
@doc("Fleet safety settings to prevent runaway loops and cascade failures")
model FleetCircuitBreakerSettings {
  @doc("Whether the circuit breaker is active")
  enabled: boolean;

  @doc("Consecutive failed agent runs that trip the circuit breaker")
  consecutiveFailureThreshold: int32;

  @doc("Percentage failure rate in rolling 15m window that trips the circuit breaker")
  failureRateThresholdPercent: int32;

  @doc("Whether tripping the breaker pauses the admission queue. When true, a tripped breaker parks new work instead of only reporting a status signal.")
  autoPauseQueue: boolean;
}

/**
 * Why the admission queue is parked, and since when.
 *
 * Deliberately a SEPARATE record from `WorkflowConfig.maxParallelFeatures`: that
 * field is the user's own ceiling, and 0 there means UNLIMITED. Expressing
 * "paused" as `maxParallelFeatures = 0` would remove the cap and admit
 * everything — the opposite of pausing — and would also destroy the ceiling the
 * user configured, so `fleet resume` could not restore it.
 *
 * The breaker only ever SETS this record. Clearing it is an explicit user act
 * (`shep fleet resume`), so a fleet that tripped while the user was asleep does
 * not silently restart into the same failing conditions.
 */
@doc("Reason the fleet admission queue is paused, and when it was paused")
model FleetQueuePause {
  @doc("Timestamp the queue was paused")
  pausedAt: utcDateTime;

  @doc("Human-readable reason the queue was paused")
  reason: string;
}
