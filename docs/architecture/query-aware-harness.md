# Query-Aware Agent Harness

Spec: [119-query-aware-agent-harness](../../specs/119-query-aware-agent-harness/spec.md).
Status: **experimental**, behind `featureFlags.queryAwareHarness`.

The Shep Harness is a shep-owned agent loop. It is exposed as the agent type
`shep-harness`, so every feature node can run on it through
`IAgentExecutorProvider`. It runs on any SDK backend: OpenRouter, Together AI,
Ollama or LLMProxy.

It differs from a transcript agent in two ways:

- **State is explicit.** Tool output, file reads and prompt sections are
  immutable *chunks* in a content-addressed blob store. A ledger records what
  the agent did.
- **Every model call is built from a persisted `ContextPlan`.** The context
  engine decides how much of each chunk this query needs (hidden, short, long
  or full), renders views from the stored raw content, and fits them to the
  budget. Nothing is concatenated from earlier turns.

## Layers

| Layer | Where | What |
| ----- | ----- | ---- |
| Domain | `packages/core/src/domain/harness/` | visibility ladder, task state machine, budget fitter, permission precedence, fingerprints, prompt sections, default config |
| Ports | `application/ports/output/harness/` | blob store, event log, repositories, model provider (+ factory), decision provider, tool source/executor, policy engine, command inspector, instruction source, workspace, project setup, eval suites/workspaces |
| Services | `application/services/harness/` | `HarnessRuntime` (query-aware and baseline loops), `HarnessTaskService` (sessions, config, structured output), context engine and candidate retriever, renderers, decision service, capability registry and router, permission service, tool invoker, session restorer |
| Use cases | `application/use-cases/harness/` | run / resume / stop / apply / promote / discard, session detail, context plan, chunk view, explain, include-from-next-turn, permissions, capabilities, policies, init, events, evals |
| Infrastructure | `infrastructure/services/harness/`, `infrastructure/repositories/harness/` | SQLite JSON-document repositories (migrations 148–151), file-system blob store, git snapshotter and worktree workspaces, builtin tools, YAML policy engine and shell inspector, decision providers, AI SDK model provider, eval suites |
| Presentation | `src/presentation/cli/commands/harness/`, `src/presentation/web/{app/harness,components/features/harness}` | `shep harness …`, `/harness`, the feature drawer's Context tab, permission prompts, the Agent Harness settings |

`tests/unit/architecture/harness-dependency-rule.test.ts` enforces these
dependency rules:

- the application layer never imports infrastructure or a provider SDK;
- the domain imports only the domain;
- web components reach core only through server actions.

## One query-aware turn

1. **Before the turn.** Stop if aborted, or if a stop was requested (it can
   come from another process). Load the "Include from next turn" decisions.
2. **Build the context plan.**
   - The candidate retriever proposes chunks, using recent tool output, path
     matches, unresolved failures, the current diff and prompt sections.
   - One batched decision scores relevance with the configured provider.
     That provider may be deterministic, any OpenAI-compatible server, a
     reranker, the harness model or Jev. It falls back to deterministic
     scoring.
   - Scores map to bands: hidden < 0.10 ≤ short < 0.45 ≤ long < 0.80 ≤ full.
   - Chunks over `fullTokenCap` (default 4,000) get their long view unless
     the agent calls `expand_chunk`.
   - Budget fitting downgrades the lowest-priority chunks first.
   - The plan is persisted, with every candidate's visibility, tokens,
     reason and source.
3. **Call the model.** One call per turn, with three meta-tools
   (`use_capability`, `expand_chunk`, `complete_task`) plus the tools loaded
   so far.
   - The Tier-1 catalog lists capabilities with their parameter names.
   - `use_capability` with `args` loads a tool and calls it in the same turn.
4. **Run each tool call.**
   - Arguments are validated against the tool's schema.
   - The action is described as resources and predicted effects. For shell
     commands this comes from a parser, not a guess.
   - YAML policy is evaluated: deny > ask > allow, and hard rules can never
     be approved.
   - An `ask` waits for a person (web, CLI) or, when non-interactive,
     resolves to deny. A grant can cover once, a task (a feature phase) or
     the session.
   - The tool runs, its output becomes a chunk, and the ledger records it.

Baseline mode is the reference loop: an append-only transcript with every tool
schema loaded. Shadow context routing runs baseline and also persists the
query-aware plans it would have used.

## Measuring it

- **Component evals** run in CI as integration tests
  (`tests/integration/evals/harness/`):
  - permission: 60 actions;
  - capability routing: 32 intents;
  - context relevance: 21 queries;
  - instruction resolution: 11 repositories.

  Set `SHEP_EVAL_REPORT_DIR` to get JSON reports.
- **The paired eval** (`shep harness eval run smoke`, or /harness → Evals) runs
  the same tasks on both modes in throwaway repositories. For each it reports:
  - success and evidence recall;
  - input and output tokens, cost and wall time;
  - turns and repeated reads;
  - the tool-output seen/raw ratio.

On tiny tasks query-aware costs slightly more input: its system prompt is
larger and there is little transcript to save. On long tasks with large tool
output it saves most of the input. See the paired-eval integration test for
both cases.
