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

## The Agent Catalog — One Source of Truth

`packages/core/src/domain/shared/agent-catalog.ts` holds every per-agent fact in
one place: label, description, kind (`cli` / `sdk` / `mock`), `supported` flag,
binary name and version args, tool-installer id, static model list, sort order,
whether a token is required, and the docs URL.

It exists because those facts used to be restated in a dozen hand-maintained
tables — the executor factory's lists, the validator's binary map, the auth use
case's metadata table, the model catalog, the TUI choices and three separate web
tables — with nothing relating them. They drifted: `codex-cli` and `llmproxy`
were missing from the auth table and reported as "Unknown", the Cursor binary was
recorded as `cursor` in two places and `cursor-agent` in two others, and two tool
ids never matched a real tool file.

The catalog is typed as a total `Record<AgentType, AgentDescriptor>`, so **adding
a member to the TypeSpec `AgentType` enum is a compile error until its facts are
filled in here.** It lives in `domain/` because it is pure data with no
dependencies — application use cases, infrastructure services, the CLI, the TUI
and the web app all read the same rows.

When you need an agent fact, read the catalog. Do not add another table.

---

## Architecture

Multi-stage workflow orchestration using LangGraph StateGraphs with agent-agnostic execution. The FeatureAgent and AnalyzeRepository graphs are implemented; the multi-agent supervisor pattern is planned.

## Overview

Shep implements a **state-based workflow system** using [LangGraph](https://www.langchain.com/langgraph) for multi-stage feature development. Nodes are **pure async functions** that process and update state. Agent execution is delegated to an `IAgentExecutor` implementation (Claude Code, Kimi Code, Codex CLI, Copilot CLI, Cursor CLI, Gemini CLI, Cline, OpenRouter, Together AI, Ollama, LLM Proxy, or the Demo mock) resolved via settings.

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

Typed workflow definition using LangGraph's Annotation API. The feature-agent
graph's channels are declared in
`feature-agent/state.ts` as `FeatureAgentAnnotation`, with
`FeatureAgentState` as the derived state type:

```typescript
import { Annotation } from '@langchain/langgraph';

export const FeatureAgentAnnotation = Annotation.Root({
  featureId: Annotation<string>,
  repositoryPath: Annotation<string>,
  specDir: Annotation<string>,
  worktreePath: Annotation<string>,
  currentNode: Annotation<string>,
  error: Annotation<string | null>({
    reducer: (prev, next) => (next !== undefined ? next : prev),
    default: () => null,
  }),
  approvalGates: Annotation<ApprovalGates | undefined>({
    reducer: (prev, next) => next ?? prev,
    default: () => undefined,
  }),
  // …many more channels
});

export type FeatureAgentState = typeof FeatureAgentAnnotation.State;
```

The graph is built by
`createFeatureAgentGraph(depsOrExecutor, checkpointer?)`, where deps is
`FeatureAgentGraphDeps { executor, selectProjectMemory? }`. A bare
`IAgentExecutor` is still accepted for the legacy call shape.

### Nodes

A node is a **factory that receives the executor** and returns the state
function. Nodes never construct, choose or configure a model client — the
executor is handed to them, which is what keeps the graph agent-agnostic:

```typescript
export function createAnalyzeNode(executor: IAgentExecutor, selectMemory?: MemorySelector) {
  return executeNode('analyze', executor, buildAnalyzePrompt, selectMemory);
}
```

`executeNode` (in `nodes/node-helpers.ts`) carries the shared concerns —
prompt building, memory injection, execution and state update — so an
individual node stays a single declarative line. Importing a model SDK such as
`ChatAnthropic` inside a node is wrong twice over: it bypasses settings-driven
resolution, and `@langchain/anthropic` is not a dependency of this project.

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

## Agent Executors

Every executor implements `IAgentExecutor` and lives in
`packages/core/src/infrastructure/services/agents/common/executors/`. The
factory picks one from `settings.agent.type`; nothing else may.

| Agent type    | Executor file                             | Kind |
| ------------- | ----------------------------------------- | ---- |
| `claude-code` | `claude-code-executor.service.ts`          | cli  |
| `kimi-code`   | `kimi-code-executor.service.ts`            | cli  |
| `codex-cli`   | `codex-cli-executor.service.ts`            | cli  |
| `copilot-cli` | `copilot-cli-executor.service.ts`          | cli  |
| `cursor`      | `cursor-executor.service.ts`               | cli  |
| `gemini-cli`  | `gemini-cli-executor.service.ts`           | cli  |
| `cline`       | `cline-executor.service.ts`                | cli  |
| `openrouter`  | `openrouter-executor.service.ts`           | sdk  |
| `together-ai` | `together-ai-executor.service.ts`          | sdk  |
| `ollama`      | `ollama-executor.service.ts`               | sdk  |
| `llmproxy`    | `llmproxy-executor.service.ts`             | sdk  |
| `dev`         | `dev-executor.service.ts`                  | mock |

**`aider` and `continue` have no executor.** They are `supported: false` in the
agent catalog, with `binary: null` and `toolId: null`, and must never reach the
executor factory. There is no `aider-executor.service.ts`.

Supporting files in the same directory:

- `ai-sdk-base-executor.service.ts` -- shared base for the four SDK executors
- `claude-code-interactive-executor.service.ts` -- Claude Code chat sessions (Agent SDK V2)
- `cursor-interactive-executor.service.ts` -- Cursor chat sessions over `cursor-agent acp`
- `acp/` -- agent-agnostic Agent Client Protocol chat session (see below)
- `cursor-cli.ts` -- Cursor binary, install hint and model-id map shared by both Cursor executors
- `mock-executor.service.ts` / `mock-executor-factory.service.ts` -- test doubles
- `process-stream.ts` -- reusable `createLineAccumulator()` and `killProcessTree()`
- `security-constraint-validator.ts` -- per-execution constraint checks

`packages/core/src/domain/shared/agent-resume-descriptor.ts` (`RESUME_BINARIES`)
records which CLI agents support session resume.

### Interactive (chat) executors

Every chat surface (Application, feature, repository and global chat) boots through
`IAgentExecutorFactory.createInteractiveExecutor(agentType)`. The factory's
`INTERACTIVE_EXECUTORS` table is the single source of truth: an agent is interactive exactly when
it has an entry there, and `supportsInteractive()` reads the same table.

| Agent         | Executor                                    | Transport                                          |
| ------------- | ------------------------------------------- | -------------------------------------------------- |
| `claude-code` | `claude-code-interactive-executor.service.ts` | Claude Agent SDK V2 session (persistent process) |
| `cursor`      | `cursor-interactive-executor.service.ts`    | `cursor-agent acp` — Agent Client Protocol on stdio |

Both keep **one agent process per chat session** and resume a conversation from the stored
agent session id after a restart.

The ACP path is generic (`executors/acp/`): `AcpInteractiveSession` speaks ACP through
`@agentclientprotocol/sdk`, maps `session/update` notifications to `InteractiveAgentEvent`
(`AcpUpdateTranslator`), resumes with `session/load` (history the agent replays during the load is
never shown as new output) and approves tool permission requests once. An agent-specific
`AcpAgentProfile` supplies the launch command, model-id mapping, login hint and extension methods —
for Cursor, the `cursor/ask_question` request, which is routed to the same question UI as Claude's
AskUserQuestion. Another agent that serves ACP (for example Gemini CLI) needs a profile, not a new
executor.

Cursor specifics worth knowing: the ACP server reads the stored login or `CURSOR_API_KEY` at start-up
and is never sent `authenticate` (a logged-out server would try to open a browser); it does not exit
when stdin closes, so `close()` kills it; on Windows it is launched through `cmd.exe /d /c` because
`cursor-agent` is a `.cmd` shim.

## Agent Executor Interfaces

The agent system uses these key interfaces (defined in `packages/core/src/application/ports/output/agents/`):

| Interface                     | Purpose                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `IAgentExecutor`              | Execute prompts against an AI coding agent                              |
| `IAgentExecutorFactory`       | Create executor instances for a given agent type                        |
| `IAgentExecutorProvider`      | Resolve the current executor from settings                              |
| `IModelCatalog`               | Live model discovery per provider (HTTP or CLI); TTL-cached             |
| `IAgentRegistry`              | Register and discover agent definitions                                 |
| `IAgentRunner`                | Run agent workflows with lifecycle management                           |
| `IAgentValidator`             | Validate agent tool availability                                        |
| `IFeatureAgentProcessService` | Manage feature agent background processes                               |
| `IStructuredAgentCaller`      | Make structured (typed) calls to agents                                 |

## Workflow Stages

| Stage            | Node factory              | Responsibility                                               |
| ---------------- | ------------------------- | ------------------------------------------------------------ |
| **Analyze**      | `createAnalyzeNode`       | Parse codebase structure, patterns, tech stack               |
| **Requirements** | `createRequirementsNode`  | Gather requirements via conversation, validate clarity       |
| **Research**     | `createResearchNode`      | Technical research feeding the plan                          |
| **Plan**         | `createPlanNode`          | Decompose into tasks, create artifacts (PRD, RFC, Tech Plan) |
| **Implement**    | `createImplementNode`     | Execute tasks respecting dependency graph                    |

Each lives in `feature-agent/nodes/<stage>.node.ts`. The graph also wires
supporting nodes from the same directory — `validate`, `repair`, `evidence`,
`extract-memory`, `apply-feedback`, `prototype-generate`, `fast-implement` and
the `merge/` node set.

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

For implementation details, see [adding-agent-nodes.md](../development/adding-agent-nodes.md) (adding a LangGraph node) and [adding-agent-types.md](../development/adding-agent-types.md) (adding an agent provider).

---

## Maintaining This Document

**Update when:**

- StateGraph structure changes
- New workflow stages added
- Node functions added or modified
- New agent executor types added

**Related docs:**

- [AGENTS.md](../../AGENTS.md) - Detailed LangGraph implementation
- [../development/adding-agent-nodes.md](../development/adding-agent-nodes.md) - Adding a LangGraph node
- [../development/adding-agent-types.md](../development/adding-agent-types.md) - Adding an agent provider
- [supervision.md](./supervision.md) - Agent collaboration & supervision (spec 093)
