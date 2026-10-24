# Evidence: `shep tui` (spec 142)

Every screenshot is a real run of the built CLI (`dist/`) with the deterministic mock executor:

1. A throwaway `SHEP_HOME` and a git repo named `acme-web`.
2. `shep feat new` four times; each feature's worker runs until its merge gate.
3. `shep tui` in a pseudo-terminal (`node-pty`), driven by key presses through
   `tests/helpers/tui/pty-screen.ts` — the same harness as `tests/e2e/tui/`.
4. The bytes the CLI wrote, replayed into xterm.js in headless Chromium and screenshotted.

`screens/*.txt` holds the plain-text screen for each frame, read from a headless xterm.

| Frame | What it shows |
| --- | --- |
| `01-console.png` | Four features at their gate: needs-you strip, roster, details pane |
| `02-approved.png` | `a` on Dark Mode Toggle: "Approved and resumed"; the feature runs, then finishes |
| `03-reject-feedback.png` | `r` on Rate Limit The Public API: typed feedback in the prompt |
| `04-rejected.png` | `enter`: "Rejected and iterating"; the feature runs again |
| `05-log.png` | `l`: the feature's worker log, wrapped to the pane |
| `06-help.png` | `?`: key help |
| `07-narrow.png` | 96 columns: the details pane moves below the roster |

`screens/exit.txt` records that `q` exited with code 0 and left the alternate screen.
`verification.txt` lists every CI check run locally and its result.

Times read `0s` and costs `—` because the mock executor reports no phase timings or cost.
