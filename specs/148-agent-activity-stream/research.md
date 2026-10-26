## Status

- **Phase:** Research
- **Updated:** 2026-10-26

## Findings

- `deriveFeatureState` (`domain/shared/feature-state.ts`) is the single derivation used by the
  TUI, web canvas and feature tree. Its priority: lifecycle overrides → run status → plan tasks.
  Pending agent questions count only in the console snapshot (`needsUserAttention`), and gate
  questions must be excluded (`isGateQuestion`) because a gate files a mirror question.
- The console snapshot already batches features (with crashed runs reconciled), runs, timings,
  pending questions and repositories — exactly what activity needs. Activity is a projection
  of its rows.
- `RunFeatureConsoleActionUseCase` already approves, rejects, stops and resumes by id or prefix
  and refuses what the run does not offer.
- The web request guard requires the token on every `/api/*` request and exempts header
  credentials from the CSRF check.
- A2A 1.0 (Linux Foundation): JSON-RPC methods `SendMessage`, `SendStreamingMessage`,
  `GetTask`, `ListTasks`, `CancelTask`, `SubscribeToTask`; enums serialized as ProtoJSON names
  (`TASK_STATE_WORKING`, `ROLE_AGENT`); a Part holds exactly one of `text`, `raw`, `url`,
  `data`; agent card at `/.well-known/agent-card.json` with `supportedInterfaces[{url,
  protocolBinding: "JSONRPC", protocolVersion: "1.0"}]`; streams are SSE `data:` lines each
  holding a JSON-RPC response whose result is a StreamResponse (`task` | `message` |
  `statusUpdate` | `artifactUpdate`); errors -32001…-32009.
- Herdr: processes in a pane inherit `HERDR_ENV=1`, `HERDR_PANE_ID`, `HERDR_BIN_PATH`;
  `pane report-agent` takes `--state idle|working|blocked|unknown`, `--message`, `--seq`
  (must increase across restarts; reports with a lower or equal number are ignored);
  `release-agent` on exit; reports must never slow the agent.

## Library Analysis

| Library | Version | Purpose | Pros | Cons |
| ------- | ------- | ------- | ---- | ---- |
| @modelcontextprotocol/sdk | existing | MCP tools | Already used by `shep mcp` | — |
| @a2a-js/sdk | 1.3.0 | A2A client in tests | Official, A2A 1.0, JSON-RPC client with streaming | 4.5 MB; its server model does not fit, so dev-only |

## Security Considerations

- A2A writes (create, approve, reject, answer, cancel) sit behind the same bearer token and Host
  check as the web UI; no new credential, no CORS headers.
- The agent card exposes only name, version, skills and the endpoint URL — no repositories or
  feature data — and is the only unauthenticated A2A path.
- Gate decisions need an explicit data part; free text never approves anything.
- The Herdr reporter passes argv to `execFile` (no shell) and sends only a state and a count
  message — no feature names, paths or prompts leave shep.
- Telemetry: no new events in this feature.

## Performance Implications

- One batched snapshot read per poll tick per watcher (the same reads the TUI does every 2 s).
  Wait and subscribe default to 1 s; timeouts are capped (MCP 10 min, CLI and A2A unbounded
  only when the caller says so).
- The Herdr reporter runs only on a change and never blocks the console render loop.

## Open Questions

All questions resolved.

---

_Updated by `/shep-kit:research` — proceed with `/shep-kit:plan`_
