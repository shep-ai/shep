# Evidence: control center and tmux status (spec 146)

A real run of the built CLI as the first window of a tmux 3.4 session whose `status-right` is
`#{@shep_status}`, with three mock-executor features waiting at their merge gate.

| Frame | What it shows |
| --- | --- |
| `01-tmux-status-segment.png` | The console publishes `◆ 3 needs you` to the tmux status bar (bottom right) |
| `03-control-center.png` | `C` (run from the palette): three windows, one per feature, named `◆ <feature>` in the tmux window list |
| `04-window-renamed.png` | `a` approves Rate Limit The Public API: its window becomes `1:✓ Rate Limit The Public API`, and the status bar drops to `◆ 2 needs you` |

Text records from the same run:

- `windows-after-C.txt` and `windows-after-approve.txt`: `tmux list-windows` before and after
  the approval.
- `tmux-options.txt`: `@shep_needs_you=2` and the styled `@shep_status`.
- `status-oneshot.txt`: `shep tui --status` and `--status tmux` with no terminal, exit 0.

`tests/e2e/tui/control-center-tmux.test.ts` asserts the same in CI.
