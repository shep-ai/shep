# Agent activity (spec 149)

One answer to "is this feature working, blocked on me, or done, and why?",
for callers outside shep's own UI: MCP clients, A2A orchestrators, scripts
(`shep feat status` / `shep feat wait`) and terminal hosts such as
[Herdr](https://herdr.dev).

## The model

| State | Meaning | From `FeatureState` |
| ----- | ------- | ------------------- |
| `working` | An agent is executing | `running` |
| `blocked` | Someone must act: an approval gate, an agent question, a review | `action-required`, or any working/waiting feature with an open agent question |
| `waiting` | Not started: queued for a slot, deferred, or waiting on a parent | `queued`, `pending`, `blocked` |
| `done` | Finished, or archived | `done`, `archived`, `deleting` |
| `failed` | The run failed, was interrupted or cancelled, or its process died | `error` |

Every activity carries a **reason** (`FeatureStateReason`): the rule that decided
it, such as `approval-gate`, `agent-question`, `queued-for-capacity` or
`process-died`. The reason comes from `explainFeatureState`
(`domain/shared/feature-state.ts`), which is the same derivation every surface
uses (`deriveFeatureState` is its `.state`). So the activity can never disagree
with the web canvas or `shep tui`. `activityOf` (`domain/shared/agent-activity.ts`)
then folds the state into the five above. A gate keeps its own reason; an open
agent question blocks a working or waiting feature with reason `agent-question`.
A gate's mirror question (spec 093) is not counted.

Each activity also has a **version**: the newest of the feature's `updatedAt`,
its run's `updatedAt` and its open questions' `createdAt`, in epoch ms. It
survives restarts. Within one watch (MCP wait, A2A stream, `shep feat wait`) it
strictly increases, because the watcher never emits a version at or below the
last one it emitted. Between two separate reads it can drop once: answering an
open question removes that question's timestamp before anything else is written.
A caller that polls should therefore compare the state as well as the version.

Enums live in `tsp/common/enums/agent-activity.tsp`: `AgentActivityState`,
`FeatureStateReason`, `ActivityWaitOutcome` and `FeatureReplyOutcome`. All are
derived and never stored, so there is no table and no migration.

## Use cases (`application/use-cases/agent-activity/`)

| Use case | What it does |
| -------- | ------------ |
| `GetAgentActivityUseCase` | Activities projected from the console snapshot (one batched read, crashed runs reconciled), with counts and the overall state. Filter by feature id or prefix, or by repository. Done features are left out of a list unless `includeSettled` is set; a feature asked for by id is always returned |
| `WatchAgentActivityUseCase` | Async generator: every activity first, then one change per feature whose state, reason, phase, run status or open question moved. Polls SQLite (1 s default) because feature workers are separate processes |
| `WaitForAgentActivityUseCase` | Returns as soon as a feature reaches one of the given states (default `blocked`, `done`, `failed`), or `timed-out` / `not-found` / `ambiguous` / `aborted` |
| `ReplyToFeatureUseCase` | Decides a gate (approve, or reject with feedback) through `RunFeatureConsoleActionUseCase`, answers the open question through `AnswerAgentQuestionUseCase`, or stops the run. Free text never decides a gate. Never throws |
| `ReportHostActivityUseCase` | Tells the terminal host (`IActivityHostReporter`) the state, only when it changes; releases the pane on exit |

## Adapters

```
GetAgentActivity ── Watch ── WaitFor ── ReplyToFeature
      │                │         │            │
      ├── MCP tools (infrastructure/services/mcp/tools/agent-activity-tools.ts)
      ├── A2A JSON-RPC (infrastructure/services/a2a/, routes /api/a2a, /.well-known/agent-card.json)
      ├── CLI: shep feat status, shep feat wait
      ├── Web: GET /api/agent-activity, GET /api/agent-activity/wait
      └── shep tui ── ReportHostActivity ── IActivityHostReporter ── Herdr | no-op
```

- **MCP** (`shep mcp`): `get_agent_activity`, `wait_for_agent_activity` (default 60 s,
  capped at 10 min because MCP clients time tool calls out), `decide_feature_gate`,
  `answer_agent_question`.
- **A2A 1.0**: see the [A2A guide](../guides/a2a.md).
- **CLI**: `shep feat status <id> [--json]`; `shep feat wait <id> [--until …]
  [--timeout s] [--json]`, which exits 0 when the state is reached, 1 for not found,
  2 on timeout, 3 for an ambiguous id and 130 when interrupted.
- **Herdr**: when `shep tui` runs in a Herdr pane (`HERDR_ENV=1`, `HERDR_PANE_ID`,
  `HERDR_BIN_PATH`), it reports `blocked` (with "needs you: N"), `working` or
  `idle` through `$HERDR_BIN_PATH pane report-agent … --source shep --agent shep
  --seq N`, and calls `release-agent` on quit. It follows Herdr's
  [agent protocol](https://herdr.dev/docs/add-herdr-support/): the sequence is the
  clock (bumped when it stands still), one call is in flight at a time and the
  latest report wins, each call has a 2 s timeout, and failures are ignored.
  Outside Herdr the no-op reporter is used. Herdr is not a dependency.
- **Web UI** — the same answers in the browser:

  | CLI / TUI | Web |
  | --------- | --- |
  | `shep feat status` (list) | **Agent activity** page (`/activity`): every feature's state, why, what the agent asks, the phase and a next-step link; "Show finished" adds done features |
  | `shep feat status <id>` | The feature drawer's Overview tab opens with an **Agent status** card |
  | `shep feat wait <id>` | **Notify me** on that card: waits on `/api/agent-activity/wait` (10-minute waits, asked again on a timeout) and raises a toast and a browser notification |
  | The TUI's Herdr report | The sidebar's **Agent activity** link shows how many features are blocked |
  | `shep mcp` tools, A2A | **Settings → Connect agents**: the A2A endpoint and agent card, where the token file is (never the token), a copyable request, Herdr setup; the MCP section lists the activity tools |

  The page and card re-read `GET /api/agent-activity` when the shared agent event stream
  reports anything, and every 15 s, so they need no second SSE connection. Approve,
  reject and answer stay where they already are: the drawer's action bar and the agent
  questions inbox, which the next-step links open.

## Not covered

- Herdr as a pane multiplexer for `shep tui` (its split is two calls).
- Reading the screen to work out the state of agents the user started by hand.
- A2A push notifications, the extended agent card, the gRPC and REST bindings, and
  shep acting as an A2A client.
