# Evidence: terminal panes, filter and inline fallback (spec 143)

Every screenshot is a real run of the built CLI (`dist/`) with the deterministic mock executor:

1. A throwaway `SHEP_HOME` and a git repository named `acme-web`.
2. `shep feat new` four times; each feature's worker runs until its merge gate.
3. A real **tmux 3.4** client (`tmux -u -L shep-evidence new-session … shep tui`) in a
   pseudo-terminal, driven by key presses through `tests/helpers/tui/pty-screen.ts`.
4. The bytes the tmux client wrote, replayed into xterm.js in headless Chromium and screenshotted.

`screens/*.txt` holds the plain-text screen for each frame.

| Frame | What it shows |
| --- | --- |
| `01-console-in-tmux.png` | `shep tui` as the only pane of a tmux window (tmux status bar at the bottom) |
| `02-follow-log-pane.png` | `f` on Billing Dashboard Charts: `shep feat logs -f <id>` opens in a split to the right; focus stays on the console |
| `03-shell-pane.png` | `t`: a shell opens beside the console in the feature's worktree; `pwd && git branch --show-current` prints the worktree and `feat/billing-dashboard-charts` |
| `04-filter.png` | `/rate`: the roster narrows to Rate Limit The Public API; the needs-you strip still lists all four |
| `05-help.png` | `?`: the new `t / T`, `f / F` and `/` keys in help |
| `06-inline-shell.png` | `SHEP_MULTIPLEXER=none`, `t`: the console steps aside; a shell runs in the worktree in the same terminal |
| `07-back-in-console.png` | `exit`: the console is back, redrawn, with its selection |

- `tmux-panes.txt`: what tmux reports after `q`. The console pane is gone; the shell (`sh`) and
  the log pane (`… feat logs -f <id>`) it opened keep running.
- `exit.txt`: the inline run exited 0 and left the alternate screen.
- `verification.txt`: every CI check run locally and its result.

Times read `0s` and costs `—` because the mock executor reports no phase timings or cost.
