# Evidence: agent activity, MCP, A2A and Herdr (spec 149)

Every frame is a real run of the built CLI (`dist/`) on 2026-10-28:

- a throwaway `SHEP_HOME` and a git repository `acme-web`;
- the deterministic mock agent (`SHEP_MOCK_EXECUTOR=1`), which runs a feature in Fast mode
  (the settings default) straight to its merge gate;
- `shep ui --port 4321` serving the A2A endpoint.

The commands ran in a pseudo-terminal (node-pty). The recorded bytes were replayed into
xterm.js in headless Chromium for the screenshots and video. The scratch directory is shown
as `~/demo`: the scenes rewrite that path in displayed output and typed commands, and change
nothing else. `screens/*.txt` hold each scene's full text.

| File | What it shows |
| --- | --- |
| `walkthrough.mp4` | All five scenes (94 s): orchestrator, CLI, MCP, Herdr, raw A2A |
| `a2a-orchestrator.gif`, `05-a2a-orchestrator.png` | A script using only the official `@a2a-js/sdk` 1.3.0 client reads the agent card and sends a feature request. It follows the task over `SubscribeToTask`: `WORKING`, then `INPUT_REQUIRED` ("Waiting for approval of the merge phase…"). It approves with a `{"decision":"approve"}` data part, then sees `WORKING` and `COMPLETED`, and the stream closes |
| `01-feat-wait.png` | `shep feat status` shows blocked, why, the phase, and the command to run next. `shep feat wait` returns with exit code 0 |
| `02-feat-status-json.png` | `--json` (state, reason, actions, version). `shep feat wait` on a missing id prints `{"outcome":"not-found"}` and exits 1 |
| `03-a2a-get-task.png` | `curl` against `/api/a2a`: the agent card, 401 without the token, `GetTask` returning `TASK_STATE_INPUT_REQUIRED` with the gate instructions and `metadata.shep` |
| `04-a2a-errors.png` | `TaskNotFoundError` (-32001); `A2A-Version: 0.3` answered with `VersionNotSupportedError` (-32009) |
| `06-mcp-tools.png` | An MCP client mounts `shep mcp`. `wait_for_agent_activity` returns `matched` and `blocked` with reason `approval-gate`. `decide_feature_gate` reject without feedback is refused (`isError`); approve is applied. `get_agent_activity` lists every feature with its state and reason |
| `07-herdr-tui.png`, `herdr.gif` | `shep tui` started with Herdr's pane environment (`HERDR_ENV=1`, `HERDR_PANE_ID`, `HERDR_BIN_PATH`) |
| `08-herdr-calls.png`, `herdr-calls.log` | The calls `shep tui` made to `$HERDR_BIN_PATH`: `report-agent … --state blocked --message "needs you: 2"`, then "needs you: 1" after a feature was approved, then `release-agent` on exit, each with a higher `--seq` |
| `09-agent-card-browser.png` | `/.well-known/agent-card.json` opened in a browser, without the token |

## Web UI

`shep ui --port 4321` on the same install, driven by Playwright (Chromium, 1440×900, light
theme). Two features waited at their merge gate, one was deferred, two had failed runs. Every
state comes from the mock agent, with one exception: the question on "Add Search Filters To The
Orders Page" was inserted into `agent_questions` with sqlite, because the mock agent never asks
one. `web-walkthrough.mp4` (50 s) is the whole run.

| File | What it shows | CLI / TUI counterpart |
| --- | --- | --- |
| `10-web-activity-page.png` | **Agent activity** page: counts per state, "2 need you", each feature's state, why, the agent's question, the phase and a next-step link. The sidebar's **Agent activity** link shows 2 | `shep feat status`; the TUI's Herdr report |
| `11-web-drawer-needs-you.png` | The drawer's Overview tab opens with **Agent status**: Needs you, waiting for approval, what the agent asks, `merge · waiting_approval`, and the next step | `shep feat status <id>` |
| `12-web-drawer-failed.png` | A failed run: the error, and Retry as the next step | `shep feat status <id>` |
| `13-web-notify-watching.png` | **Notify me** on a deferred feature: watching | `shep feat wait <id>` |
| `14-web-notify-toast.png` | `shep feat start` from a terminal; when the feature reaches its gate the wait matches and the page raises "…: Needs you" (and a browser notification). The sidebar count goes to 3 | `shep feat wait` returning 0 |
| `15-web-activity-show-finished.png` | After `shep feat approve` in a terminal, the page updates without a reload; **Show finished** adds done features | `shep feat status` |
| `16-web-connect-agents.png` | **Settings → Connect agents**: the endpoint read from the agent card, the token file's path (never the token), a copyable request, Herdr and terminal setup | A2A guide |
| `17-web-mcp-activity-tools.png` | The MCP catalog lists `get_agent_activity`, `wait_for_agent_activity`, `decide_feature_gate`, `answer_agent_question` | `shep mcp` |

## Not shown

- **Herdr itself.** `HERDR_BIN_PATH` pointed at a stand-in script that logs each call. The
  calls are the ones Herdr documents in "Add Herdr support to your agent". Running the real
  Herdr 0.9.5 binary was not permitted in the recording environment.
- **Agent questions.** The mock agent asks no questions, so `agent-question` and
  `answer_agent_question` are covered by unit tests (`reply-to-feature.use-case.test.ts`,
  `agent-activity-tools.test.ts`) only.

## Found by these runs

The first orchestrator run created a feature that ran the full spec pipeline, not the
user's default mode. A2A (and the existing MCP `create_feature`) called `CreateFeatureUseCase`
without the Settings → Workflow defaults that `shep feat new` applies in the command.
Fixed in this PR: `featureWorkflowDefaults` and `CreateFeatureInput.useWorkflowDefaults`.
The run above is after the fix.

The web runs found three more:

- **Ordering.** `GetAgentActivityUseCase` documented "most urgent first" but kept the console
  snapshot's order, so a done feature could list above a waiting one. It now sorts blocked,
  working, waiting, failed, done (stable within a state); `compareActivityUrgency` is in the
  domain.
- **Drawer next step.** The card said "Use the actions below" on the Overview tab, where there
  are none: a gate is decided on its review tab and a failed run is retried from the drawer's
  header. The card now says which.
- **Dashboard auto-resolve.** Opening the dashboard runs AutoResolveMergedBranches, which
  closed two gate features as merged because the mock agent had made no commits on their
  branches. The recording gave those branches a commit first. This is existing behaviour and
  this PR does not change it.

One `shep ui` process exited during the first web run with an uncaught `Error: aborted`
(Node's `abortIncoming`, from a client socket closing mid-request); the CLI's
`uncaughtException` handler exits on any error. It did not happen again in 12 rapid page
changes or three further full runs. It is reported on the PR rather than changed here.

