# Evidence: agent activity, MCP, A2A and Herdr (spec 148)

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
