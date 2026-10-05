# Software factory — evidence (specs 120–132)

Everything here was captured from a real `shep` build (`pnpm build:release`)
running against an isolated `SHEP_HOME`. No Storybook.

| Folder | What                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| `cli/` | One GIF, asciinema cast and plain-text transcript per scene (01–06)          |
| `ui/`  | Screenshots of each step of a clicked-through `shep ui`, plus the video walk |
| `demo/`| The scripts that produced both, so anyone can replay them                    |

## What is real and what is stubbed

- **Real**: the CLI, the web UI, the daemon routes (`/api/feedback`, `/api/alerts`),
  SQLite, git repositories, the use cases and every state change you see.
- **Agent**: the built-in `dev` agent type (no account needed). It answers
  investigations, incident triage and discovery with fixed, well-formed
  answers, so the flow is deterministic.
- **Cluster**: `demo/kubectl-stub.sh` is put first on `PATH` as `kubectl`.
  It answers like a healthy cluster and logs every call to `kubectl.log`.
- **Time**: `demo/backdate-outcome.mjs` moves one shipped outcome 15 days back
  so `shep outcome check` has something to judge today.

## Replay

```bash
pnpm build:release
export DEMO_DIR=/tmp/shep-demo SHEP_HOME=/tmp/shep-demo-home
bash .github/pr-assets/factory/demo/00-setup.sh
export PATH=$DEMO_DIR/bin:$PATH
node dist/src/presentation/cli/index.js ui --port 4050 --no-open &
for scene in 01-spaces 02-opportunities 03-feedback-discovery 04-incidents 05-outcomes 06-autopilot; do
  bash .github/pr-assets/factory/demo/$scene.sh
done
# Screenshots and video (run from the repository root)
OUT=ui-evidence node .github/pr-assets/factory/demo/capture-ui.mjs
```

`TYPE_DELAY` sets the typing speed (`0` for none), `CHROMIUM` points the
capture at a Chromium binary when Playwright's own is not installed, and
`UI` at a `shep ui` on another port.
