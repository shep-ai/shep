# Supervisor Agent

## Purpose

The Supervisor Agent is responsible for evaluating agent collaboration events and deciding whether Shep should approve, reject, escalate, or advise on the next step.

It observes events from the collaboration fabric and helps enforce user-delegated policy for:

- approval gates
- agent questions
- inter-agent messages

The supervisor is part of spec 093 and is gated behind the `collaboration` feature flag. With the flag off, the collaboration and supervision surface stays disabled.

The long-form architecture lives in [`../architecture/supervision.md`](../architecture/supervision.md). This page documents the per-agent identity, prompt source, output schema, flow, and operational notes.

---

## Agent Identity

| Property | Value |
|-----------|--------|
| Agent | `supervisor` |
| Lane | `agents` |
| Registration | `ISupervisorAgent` via the agent DI rail |
| Integration Point | `EvaluateSupervisorDecisionUseCase` + `packages/core/src/infrastructure/services/agents/supervisor-agent/supervisor-agent-worker.ts` |
| Spec | `specs/093-agent-collaboration-supervision/spec.yaml` |
| Flag Gate | `collaboration` |

The core evaluation entry point is [`EvaluateSupervisorDecisionUseCase`](../../packages/core/src/application/use-cases/agents/evaluate-supervisor-decision.use-case.ts), which:

1. checks the `collaboration` feature flag
2. resolves the effective supervisor policy
3. calls `ISupervisorAgent.evaluate(...)`
4. persists the immutable `SupervisorDecision`
5. mirrors the decision into `activity_log` with `actor_id = "supervisor:<id>"`

The worker entry point is [`supervisor-agent-worker.ts`](../../packages/core/src/infrastructure/services/agents/supervisor-agent/supervisor-agent-worker.ts). It owns a supervisor `AgentRun`, heartbeats while active, evaluates submitted events, and reaps idle workers after the configured TTL.

---

## System Prompt

The evaluator behavior is defined in the supervisor prompt source and should be treated as the source of truth.

Prompt file:

- [`evaluator-prompt.ts`](../../packages/core/src/infrastructure/services/agents/supervisor-agent/evaluator-prompt.ts)

The runtime resolves the evaluator system header through the prompt resolver slot:

```text
supervisor-agent/evaluator.system
```

If no override is configured, the bundled `SUPERVISOR_EVALUATOR_SYSTEM_HEADER` is used.

The prompt source defines:

- the supported verdicts
- the hard safety rules
- the evaluator prompt version
- policy and event formatting
- the deterministic timeout fallback decision

This documentation intentionally does **not** duplicate the prompt text. Any behavioral changes must be made in `evaluator-prompt.ts` or through the prompt override mechanism.

---

## Output Schema

Supervisor decisions are defined by TypeSpec:

- [`tsp/agents/supervisor-decision.tsp`](../../tsp/agents/supervisor-decision.tsp)
- `SupervisorDecision` and `SupervisorVerdict` are generated into `packages/core/src/domain/generated/output.ts`

Do not edit generated files directly.

### Verdicts

`SupervisorVerdict` values are:

```ts
approve = 'approve'
reject = 'reject'
escalate = 'escalate'
advise = 'advise'
```

### Decision Shape

```ts
{
  id: string;
  scopeType: string;
  scopeId?: string;
  featureId?: string;
  supervisorRunId: string;
  sourceEventKind: string;
  sourceEventId: string;
  verdict: SupervisorVerdict;
  rationale: string;
  modelId: string;
  promptVersion: string;
  ruleRef?: string;
  confidence?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Field Rules

| Field | Description |
|------|-------------|
| `verdict` | One of `approve`, `reject`, `escalate`, or `advise` |
| `rationale` | Human-readable explanation persisted for audit |
| `modelId` | Snapshot of the model used during evaluation |
| `promptVersion` | Snapshot of the evaluator prompt version |
| `ruleRef` | Optional policy rule reference |
| `confidence` | Optional evaluator confidence value from 0 to 1 |
| `sourceEventKind` | Event kind evaluated by the supervisor, currently `gate`, `question`, or `message` |
| `sourceEventId` | Identifier of the source event being evaluated |

---

## Flow

The LangGraph workflow is implemented in [`supervisor-graph.ts`](../../packages/core/src/infrastructure/services/agents/supervisor-agent/supervisor-graph.ts).

```text
ingest-event -> evaluate -> emit-decision
```

1. `ingest-event` resolves the evaluator system header, builds the prompt, and carries the source event into graph state.
2. `evaluate` calls the resolved agent executor with the evaluator prompt.
3. `emit-decision` verifies that a decision exists before the graph completes.

The production adapter is [`LangGraphSupervisorAgent`](../../packages/core/src/infrastructure/services/agents/supervisor-agent/langgraph-supervisor-agent.ts). It resolves the evaluator LLM through `IAgentExecutorProvider`, so the supervisor follows the same agent-agnostic rule as every other agent surface.

The graph itself is side-effect free. Persistence, audit-log mirroring, notifications, and policy resolution belong to `EvaluateSupervisorDecisionUseCase`.

### Timeout And Fallback

Supervisor evaluation is on the approval path, so failure must be fail-safe.

The evaluator uses `SUPERVISOR_EVALUATOR_SOFT_TIMEOUT_MS`, defined in [`supervisor-agent.interface.ts`](../../packages/core/src/application/ports/output/agents/supervisor-agent.interface.ts), with the current value:

```ts
25_000
```

If the evaluator times out, the graph returns the deterministic fallback from `SUPERVISOR_TIMEOUT_DECISION`:

```ts
{
  verdict: 'escalate',
  rationale: 'timeout',
}
```

This satisfies FR-22: the supervisor must not block the human path. On timeout or model failure, Shep escalates back to the user so the existing approval or question flow can continue.

---

## Suggested Labels / Notes

Suggested labels for issues or PRs touching this agent:

- `lane:agents`
- `type:docs` for documentation-only changes
- `difficulty:easy` for identity-page updates

### Authority

Supervisor authority is controlled by `SupervisorPolicy.autonomyLevel`:

| Level | Supervisor authority |
|---|---|
| `advisory` | May return `advise` or `escalate`; the user still acts on gates |
| `cosign` | May pre-vote, but the user must also approve before a gate passes |
| `autonomous` | May close gates through the existing approve/reject use cases |

When the supervisor acts on a user's behalf, it uses the actor namespace:

```text
supervisor:<id>
```

The approval and rejection use cases enforce the "user always wins" invariant. If a prior `user:<id>` decision exists for the same gate, a later supervisor action is refused and recorded for audit.

### Operational Notes

Operational notes:

- The whole surface is gated by the `collaboration` feature flag.
- Policy resolution is feature-first, then scope fallback.
- The supervisor worker is scoped and reaped when idle.
- Decisions are immutable audit records and are mirrored into `activity_log`.
- The supervisor evaluates `gate`, `question`, and `message` events.

---

## Local Validation

For documentation-only changes, run:

```bash
pnpm validate
```

This matches the acceptance criteria for the issue that introduced this page.

---

## Related Documentation

- [`../architecture/supervision.md`](../architecture/supervision.md)
- [`../architecture/agent-system.md`](../architecture/agent-system.md)
- [`../../specs/093-agent-collaboration-supervision/spec.yaml`](../../specs/093-agent-collaboration-supervision/spec.yaml)
- [`../../AGENTS.md`](../../AGENTS.md)
