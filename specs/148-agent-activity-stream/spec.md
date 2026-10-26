## Problem Statement

Shep knows exactly what each feature's agent is doing — it runs them — but it only tells
people looking at its own UI. Three kinds of callers cannot ask:

1. **Other agents over MCP.** `shep mcp` can create and start features, but cannot tell an
   agent "this feature is now waiting for you" or let it wait until that happens. There is
   no approve, reject or answer tool either.
2. **Other orchestrators.** A2A 1.0 is the standard way one agent system hands tasks to
   another and follows them. Shep has no A2A endpoint; its HTTP API is undocumented UI
   plumbing.
3. **Terminal hosts like Herdr**, which show every agent's working / blocked / idle state in
   a sidebar and notify when one needs the user. Shep shows up there as a plain terminal.

The state itself is decided in one place (`deriveFeatureState`), but the reason is lost:
callers see `action-required` or `error`, not "waiting at the plan gate" or "the agent
process died". `shep feat ls` re-implements the derivation, and only the TUI counts open
agent questions as needing the user.

## Success Criteria

- [ ] `AgentActivityState` (working, blocked, waiting, done, failed) and `FeatureStateReason`
      are TypeSpec enums; `explainFeatureState` returns the state and its reason and
      `deriveFeatureState` delegates to it, with no behaviour change
- [ ] `GetAgentActivityUseCase` returns, per feature: activity state, reason, feature state,
      phase, run status, pending question (id and prompt), error, PR, version and when it
      changed; plus counts and the overall state; filterable by feature (id or prefix) and
      repository, settled features optional
- [ ] `WaitForAgentActivityUseCase` returns as soon as the feature reaches one of the
      requested states (default blocked, done, failed), or reports a timeout, a missing
      feature or an abort; an already-matching feature returns at once
- [ ] `WatchAgentActivityUseCase` yields one change per feature whose state, reason, phase or
      question changed, with versions that never go down, until aborted
- [ ] MCP: `get_agent_activity`, `wait_for_agent_activity`, `decide_feature_gate`
      (approve / reject with feedback) and `answer_agent_question`
- [ ] A2A 1.0 JSON-RPC at `/api/a2a`: SendMessage, SendStreamingMessage, GetTask, ListTasks,
      CancelTask, SubscribeToTask (SSE); agent card at `/.well-known/agent-card.json`;
      A2A error codes; unsupported methods answer UnsupportedOperationError
- [ ] Task status follows the activity: working → TASK_STATE_WORKING, blocked →
      TASK_STATE_INPUT_REQUIRED (status message says what is asked), waiting →
      TASK_STATE_SUBMITTED, done → TASK_STATE_COMPLETED, failed → TASK_STATE_FAILED (a
      cancelled run → TASK_STATE_CANCELED)
- [ ] `shep feat status <id>` explains a feature's activity (`--json` too); `shep feat wait
      <id> --until … --timeout …` exits 0 on a match and non-zero on timeout
- [ ] Inside Herdr, `shep tui` reports blocked / working / idle with a strictly increasing
      sequence, only on change, never slowing or failing the console, and releases on quit
- [ ] Docs: `docs/architecture/agent-activity.md`, A2A guide, MCP tool list, CLI reference

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `tsp/common/enums/agent-activity.tsp` | Medium | `AgentActivityState`, `FeatureStateReason` |
| `domain/shared/feature-state.ts`, new `agent-activity.ts` | High | Reason-returning derivation; activity mapping; version |
| `GetFeatureConsoleSnapshotUseCase` + types | Medium | Rows carry reason, activity, pending question, version |
| `application/use-cases/agent-activity/` | High | Get, wait, watch, report-to-host use cases |
| `ports/output/services/activity-host-reporter.interface.ts` | Low | Port for terminal hosts |
| `infrastructure/services/activity-host/` | Medium | Herdr reporter, no-op reporter, DI selection |
| `infrastructure/services/mcp/tools/agent-activity-tools.ts` | Medium | Four MCP tools |
| `infrastructure/services/a2a/` | High | JSON-RPC dispatcher, task mapper, agent card, SSE framing |
| `src/presentation/web/app/api/a2a`, `app/.well-known/agent-card.json` | Medium | Thin route handlers |
| `src/presentation/cli/commands/feat/{status,wait}.command.ts`, locales | Medium | CLI surface in nine locales |
| `src/presentation/tui/feature-console/feature-console.app.ts`, `tui.command.ts` | Low | Report activity each refresh, release on quit |
| docs | Medium | Architecture, A2A guide, MCP and CLI references |

## Dependencies

- `deriveFeatureState` and the console snapshot (specs 142, 146)
- `RunFeatureConsoleActionUseCase` (approve / reject / stop) and `AnswerAgentQuestionUseCase`
  (spec 093)
- `CreateFeatureUseCase`, the MCP server (spec 077), the web request guard (bearer token)

## Out of Scope

- Herdr as a pane multiplexer for `shep tui` (two-step split); screen-reading detection of
  agents the user started by hand
- A2A push notifications, extended agent card, gRPC/REST bindings, A2A client (shep calling
  other agents)
- Rewriting `shep feat ls` and the web canvas on top of the activity model (follow-up)

## Size Estimate

**XL** - a domain refactor, two enums, four use cases, a port with two adapters, four MCP
tools, an A2A server with streaming, two CLI commands in nine locales, TUI wiring, docs and
unit, integration and e2e tests.
