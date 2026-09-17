# Agent System Architecture

> **Implementation Status**
>
> The **FeatureAgent LangGraph graph** is implemented at `packages/core/src/infrastructure/services/agents/feature-agent/` with background execution support, validation/repair loops, and human-in-the-loop approval. The **AnalyzeRepository graph** is implemented at `packages/core/src/infrastructure/services/agents/analyze-repo/`. The **Supervisor agent** (spec 093) is implemented at `packages/core/src/infrastructure/services/agents/supervisor-agent/` and is gated behind the `collaboration` feature flag — see [supervision](./supervision.md). The **DevServerAgent graph** (spec 103) is implemented at `packages/core/src/infrastructure/services/agents/dev-server-agent/` — it replaces the deterministic-only, blocking-install "start dev server" flow and supersedes the dormant spec-068 prototype.
>
> See [AGENTS.md](../../AGENTS.md#current-implementation) for full implementation details including the directory structure, state schema, graph flow, and node descriptions.

---

## Settings-Driven Agent Resolution (MANDATORY -- Applies to All Architecture)

> **ARCHITECTURAL RULE:** Whether using the current executor-based system or the planned LangGraph system, agent type resolution MUST always come from `getSettings().agent.type` via `AgentExecutorFactory.createExecutor()`. No node, graph, use case, or worker may hardcode, guess, or default an agent type. This rule applies to ALL current and future agent implementations.

See [AGENTS.md -- Settings-Driven Agent Resolution](../../AGENTS.md#settings-driven-agent-resolution-mandatory) for the full rule and resolution flow.

---

## Architecture

Multi-stage workflow orchestration using LangGraph StateGraphs with agent-agnostic execution. The FeatureAgent and AnalyzeRepository graphs are implemented; the multi-agent supervisor pattern is planned.

## Overview

Shep implements a **state-based workflow system** using [LangGraph](https://www.langchain.com/langgraph) for multi-stage feature development. Nodes are **pure async functions** that process and update state. Agent execution is delegated to an `IAgentExecutor` implementation (Claude Code, Gemini CLI, Aider, Cursor, etc.) resolved via settings.

```
+-----------------------------------------+
|     FeatureWorkflow (StateGraph)        |
+-----------------------------------------+
|                                         |
|  [Analyze] --> [Gather Req] --> [Plan]  |
|                     |                   |
|                 (loop until             |
|                  clear)                 |
|                     |                   |
|                     v                   |
|              [Implement] --> [END]      |
|                                         |
|  State: typed, immutable updates        |
|  Execution: IAgentExecutor (delegated)  |
|                                         |
+-----------------------------------------+
```

## Design Principles

1. **State-Driven**: All workflow state flows through a typed schema
2. **Pure Functions**: Nodes are deterministic, side-effect-free async functions
3. **Explicit Edges**: Flow control via direct or conditional edges (no hidden routing)
4. **Agent-Agnostic**: Execution delegated to `IAgentExecutor` implementations resolved via settings
5. **Type Safe**: TypeScript Annotations with Zod validation for tool parameters
6. **Observable**: Full execution history via checkpoints

## Core Concepts

### StateGraph

Typed workflow definition using LangGraph's StateGraph:

```typescript
import { Annotation } from '@langchain/langgraph';

export const FeatureState = Annotation.Root({
  repoPath: Annotation<string>,
  requirements: Annotation<Requirement[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  plan: Annotation<Plan | null>,
  tasks: Annotation<Task[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  messages: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

export type FeatureStateType = typeof FeatureState.State;
```

### Nodes

Functions that process and update state by delegating to `IAgentExecutor`:

```typescript
function createAnalyzeNode(executor: IAgentExecutor) {
  return async (
    state: AnalyzeRepositoryStateType
  ): Promise<Partial<AnalyzeRepositoryStateType>> => {
    const prompt = buildAnalyzePrompt(state.repositoryPath);
    const result = await executor.execute(prompt, {
      cwd: state.repositoryPath,
    });
    return { analysisMarkdown: result.result };
  };
}
```

### Edges

Connections defining workflow progression:

```typescript
// Direct edge: always go from A to B
graph.addEdge('analyze', 'requirements');

// Conditional edge: choose based on state
graph.addConditionalEdges('requirements', (state) => {
  if (allRequirementsClear(state)) return 'plan';
  return 'requirements'; // Loop back for clarification
});
```

## Implemented Graphs

### AnalyzeRepository Graph

Located at `packages/core/src/infrastructure/services/agents/analyze-repo/`. Single-node graph that generates a repository analysis document.

### FeatureAgent Graph

Located at `packages/core/src/infrastructure/services/agents/feature-agent/`. Full SDLC workflow graph with:

- Background process execution via worker
- Heartbeat monitoring
- Phase timing tracking
- Human-in-the-loop approval gates
- Lifecycle context management

Key files:

- `feature-agent-graph.ts` -- Full SDLC graph definition
- `fast-feature-agent-graph.ts` -- Simplified fast-mode graph
- `feature-agent-process.service.ts` -- Process management
- `feature-agent-worker.ts` -- Background worker (also emits parallel `AgentQuestion` of `kind = blocking` on every `waiting_approval` transition for the unified inbox)
- `state.ts` -- State annotation
- `nodes/` -- Individual node implementations

### Supervisor Agent Graph (spec 093, flag-gated)

Located at `packages/core/src/infrastructure/services/agents/supervisor-agent/`. A
delegated guardian agent that evaluates approval gates and agent questions on
behalf of the user. Gated behind `FeatureFlags.collaboration`. See
[supervision.md](./supervision.md) for the full design.

Key files:

- `supervisor-graph.ts` -- LangGraph workflow: `ingest-event` → `load-policy` → `evaluate` (LLM via `IAgentExecutorProvider`) → `emit-decision` → optional `publish-message`
- `supervisor-agent-worker.ts` -- Lazy per-`(appId, featureId?)` background worker, mirrors the feature-agent-worker shape (own `agent_runs` row with `agent_type='supervisor'`, heartbeat, checkpointing)
- `evaluator-prompt.ts` -- Versioned prompt registry; the version is recorded on every `SupervisorDecision`
- `stub-supervisor-executor.ts` -- Deterministic stub (`InMemorySupervisorAgent`) used by tests so unit / integration coverage runs without an LLM call

### Dev-Server Agent Graph (spec 103)

Located at `packages/core/src/infrastructure/services/agents/dev-server-agent/`.
Converts "start dev server" from a deterministic-only, blocking-install
pipeline into a bounded LangGraph agent that analyzes the repository,
provisions missing infrastructure and dependencies, starts the server with an
explicit run plan, and verifies readiness -- with agent-driven remediation on
failure. It supersedes the dormant spec-068 prototype (`AgentDeploymentService`
/ `DevEnvironmentAgentService`, both deleted); `IStructuredAgentCaller` is the
one piece of that prototype that remains, shared across graphs.

```
START → analyze → ensure_infra → install_deps → start_server → verify → END
                       ▲                │                         │
                       └── remediate ◄──┴─────────────────────────┘
```

- `analyze` / `ensure_infra` failures are terminal (straight to `END` with
  `failureReason` set) -- neither is remediated by the loop.
- `install_deps` / `verify` failures route to `remediate` while attempts
  remain (`MAX_REMEDIATION_ATTEMPTS = 2`); `remediate` loops back to
  `ensure_infra`. Exhaustion terminates with the last `failureReason`.

**State channels** (`state.ts`):

| Channel                | Type                       | Semantics                                                                |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `targetId`/`targetType`/`targetPath` | `string`       | Invoke-time inputs, set once                                             |
| `runPlan`               | `DevServerRunPlan \| null`  | Resolved plan (cache / deterministic / agent); last-write-wins           |
| `infraReady`            | `boolean`                   | Set by `ensure_infra` once required binaries are confirmed present       |
| `depsInstalled`         | `boolean`                   | Set by `install_deps` once dependencies are installed or fresh          |
| `resultUrl`             | `string \| null`            | Terminal success signal, written by `verify`                            |
| `failureReason`         | `string \| null`            | Terminal failure signal; `remediate` explicitly writes `null` to retry   |
| `remediationAttempts`   | `number`                    | Routing budget, incremented by `remediate`                              |
| `lastErrorTail`         | `string[]`                  | Tail of the most recent failed command's output; replaced per failure   |
| `capturedLogs`          | `string[]`                  | Append-only accumulator of every node's progress lines                  |
| `degraded`              | `boolean`                   | True once any node ran without an agent executor / structured caller    |

**Ports used:**

| Port                          | Consumed by                                | Purpose                                                                                          |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `IAgentExecutorProvider`       | `DevServerAgentService`                     | Lazily resolves the `IAgentExecutor` wired into `ensure_infra`/`remediate`; a missing or throwing provider degrades to `null` (deterministic-only) rather than failing the run |
| `IStructuredAgentCaller`       | `analyze` node                              | Schema-validated repository analysis (`RUN_PLAN_ANALYSIS_SCHEMA`) when deterministic detection can't resolve a command; `null` forces deterministic-only analysis |
| `IDevServerRunPlanRepository`  | `analyze`, `install_deps`, `remediate` nodes | Per-repo run-plan cache: `findByRepoPath`/`upsert`/`stampInstallHash`/`deleteByRepoPath`         |
| `IDeploymentService`           | `start_server`/`verify` nodes, `DevServerAgentService` | `setTransientState` (Analyzing/Installing), `appendLog` (SSE bridge), `start()` with a `RunPlanOverride`, `getStatus`/`getLogs` |

**Fast path and degradation.** `analyze` resolves a run plan cheapest-first:
(1) a cached plan whose `configHash` still matches the repo's manifest
fingerprint, (2) `detectDevScript()` deterministic `package.json` detection --
both make zero LLM calls -- and only on a Tier-1/2 miss, (3) a structured
`IStructuredAgentCaller.call()` against `RUN_PLAN_ANALYSIS_SCHEMA`.
`DevServerAgentService` (the `IDevServerAgentService` implementation) resolves
the executor and structured caller lazily; either being unavailable (or
throwing) degrades the whole run to deterministic-only instead of failing --
`degraded: true` is set on the state, and if deterministic detection also
fails, the run terminates with an actionable `failureReason` instead of an
agent call.

**Remediation bounds.** `ensure_infra` performs its own one-shot, user-space,
non-interactive remediation for missing binaries (ahead of the graph-level
loop) and re-probes just the binaries that were missing. The graph-level loop
is bounded by `MAX_REMEDIATION_ATTEMPTS = 2` (`dev-server-agent-graph.ts`): on
an `install_deps` or `verify` failure, `remediate` invalidates the cached run
plan (`deleteByRepoPath` -- the plan may be the cause), runs one bounded agent
execution seeded with the failure reason and error tail, and on success
explicitly overwrites `failureReason: null` (the reducer lets an explicit
`null` override the previous value) so the graph loops back through
`ensure_infra` and retries. An executor throw, or exhausted attempts,
terminates the run with the last `failureReason`.

**Run-plan cache.** Plans persist in the additive `dev_server_run_plans` table
(`repoPath` primary key, `RunPlanSource.Deterministic | Agent`), invalidated
by `configHash` -- a fingerprint of the repo's manifest/lockfile inventory
(`computeConfigHash`). A stale `configHash` triggers re-detection/re-analysis
and replaces the cached row. Install staleness uses a separate
`installStampHash` (`computeInstallHash`, the strongest single
lockfile/manifest signal), stamped only after a fully successful install --
covering both the package-manager install and the plan's `setupCommands` --
so a fresh hit skips both on the next run.

Key files:

- `dev-server-agent-graph.ts` -- Graph wiring, routing functions, `MAX_REMEDIATION_ATTEMPTS`
- `dev-server-agent.service.ts` -- `IDevServerAgentService` implementation: fire-and-track accept contract, single-flight per `targetId`, executor resolution, node composition
- `state.ts` -- State annotation
- `nodes/` -- `analyze`, `ensure-infra`, `install-deps`, `start-server`, `verify`, `remediate` node factories (+ `prompts/` for the analysis and remediation prompts)
- `schemas/run-plan-analysis.schema.ts` -- `RUN_PLAN_ANALYSIS_SCHEMA` / `DevServerAnalysis`

## Collaboration & Question Pipeline (spec 093, flag-gated)

Three new domain entities — defined in `tsp/agents/` — extend the agent system
with structured inter-agent messaging and a unified question/escalation
pipeline. All are gated behind the `collaboration` feature flag.

| Entity | Source | Storage |
|---|---|---|
| `AgentMessage` | `tsp/agents/agent-message.tsp` | `agent_messages` (migration 087) |
| `AgentQuestion` | `tsp/agents/agent-question.tsp` | `agent_questions` (migration 088) |
| `SupervisorPolicy` | `tsp/agents/supervisor-policy.tsp` | `supervisor_policies` (migration 089) |
| `SupervisorDecision` | `tsp/agents/supervisor-decision.tsp` | `supervisor_decisions` (migration 090) + mirrored to `activity_log` |

New ports:

| Port | Path |
|---|---|
| `IAgentMessageBus` | `packages/core/src/application/ports/output/agents/agent-message-bus.interface.ts` |
| `IAgentQuestionService` | `packages/core/src/application/ports/output/agents/agent-question-service.interface.ts` |
| `ISupervisorAgent` | `packages/core/src/application/ports/output/agents/supervisor-agent.interface.ts` |
| `IAgentMessageRepository` | `packages/core/src/application/ports/output/repositories/agent-message-repository.interface.ts` |
| `IAgentQuestionRepository` | `packages/core/src/application/ports/output/repositories/agent-question-repository.interface.ts` |
| `ISupervisorPolicyRepository` | `packages/core/src/application/ports/output/repositories/supervisor-policy-repository.interface.ts` |
| `ISupervisorDecisionRepository` | `packages/core/src/application/ports/output/repositories/supervisor-decision-repository.interface.ts` |

New use cases (under `packages/core/src/application/use-cases/agents/`):

`SendAgentMessage`, `ListAgentMessages`, `AskAgentQuestion`,
`AnswerAgentQuestion`, `CancelAgentQuestion`, `ListAgentQuestions`,
`EscalateToUser`, `ConfigureSupervisor`, `EnableSupervisor`,
`DisableSupervisor`, `GetSupervisorPolicy`, `EvaluateSupervisorDecision`.

`ApproveAgentRunUseCase` and `RejectAgentRunUseCase` are extended to recognise
the `supervisor:<id>` actor namespace and to enforce the **"user always wins"**
invariant. See [supervision.md](./supervision.md) for the full sequence
diagrams.

Three new SSE event kinds — `agent_message`, `agent_question`,
`supervisor_decision` — are streamed through `StreamAgentEventsUseCase` via
dedicated compute helpers (`compute-message-deltas.ts`,
`compute-question-deltas.ts`, `compute-decision-deltas.ts`).

## Agent Executor Interfaces

The agent system uses these key interfaces (defined in `packages/core/src/application/ports/output/agents/`):

| Interface                     | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `IAgentExecutor`              | Execute prompts against an AI coding agent       |
| `IAgentExecutorFactory`       | Create executor instances for a given agent type |
| `IAgentExecutorProvider`      | Resolve the current executor from settings       |
| `IAgentRegistry`              | Register and discover agent definitions          |
| `IAgentRunner`                | Run agent workflows with lifecycle management    |
| `IAgentValidator`             | Validate agent tool availability                 |
| `IFeatureAgentProcessService` | Manage feature agent background processes        |
| `IStructuredAgentCaller`      | Make structured (typed) calls to agents          |

## Workflow Stages

| Stage            | Node               | Responsibility                                               |
| ---------------- | ------------------ | ------------------------------------------------------------ |
| **Analyze**      | `analyzeNode`      | Parse codebase structure, patterns, tech stack               |
| **Requirements** | `requirementsNode` | Gather requirements via conversation, validate clarity       |
| **Plan**         | `planNode`         | Decompose into tasks, create artifacts (PRD, RFC, Tech Plan) |
| **Implement**    | `implementNode`    | Execute tasks respecting dependency graph                    |

## Adaptive Model Selection (spec 110)

By default every node and every task in a run uses the model pinned for that run
(`Feature.model` → `FeatureAgentState.model` → `AgentExecutionOptions.model`).
When `settings.models.adaptive.enabled` is on, the **implement** node instead
routes each planned task to the model tier matching its complexity.

| Piece                                              | Responsibility                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `domain/shared/model-tier.ts`                      | Tier catalog, complexity normalizer, heuristic classifier, resolver     |
| `plan.prompt.ts`                                   | Asks the planning agent for a `complexity` on every task in tasks.yaml  |
| `nodes/adaptive-task-routing.ts`                   | Resolves a model per task and batches consecutive same-model runs       |
| `implement.node.ts`                                | Executes each batch with `buildExecutorOptions(state, { model }, …)`    |
| `IAgentExecutorFactory.resolveAdaptiveModelPlan()` | Exposes the resolved tier triple to use cases and presentation layers   |

Three invariants keep it safe:

1. **The pin is a ceiling.** A tier never resolves to a model more capable than
   the pinned one, so an explicit Sonnet pin is never promoted to Opus.
2. **Degradation stays in-family.** A Gemini pin degrades to a Gemini model.
   Cross-family selection only happens via an explicit per-tier override.
3. **Candidates come from the agent's own catalog.** A pinned model the tier
   catalog does not recognise collapses all three tiers onto itself, making the
   mode a no-op rather than a source of `Unsupported model` errors.

Tasks with no declared complexity are classified deterministically by
`classifyTaskComplexity`, so plans written before this shipped route the same way
on every run.

Configure it from `shep settings adaptive-models` or Settings → Adaptive models.
When adding a model to `agent-model-catalog.ts`, add a matching entry to
`MODEL_TIERS` in `model-tier.ts` if tasks should be routable onto it.

## Practical Example

For implementation details, see [docs/development/adding-agents.md](../development/adding-agents.md).

---

## Maintaining This Document

**Update when:**

- StateGraph structure changes
- New workflow stages added
- Node functions added or modified
- New agent executor types added

**Related docs:**

- [AGENTS.md](../../AGENTS.md) - Detailed LangGraph implementation
- [../development/adding-agents.md](../development/adding-agents.md) - Adding new nodes
- [supervision.md](./supervision.md) - Agent collaboration & supervision (spec 093)
