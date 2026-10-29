# Self-learning harness — evidence (spec 150)

Everything here was captured from a real `shep` build (`pnpm build:release`) running against an
isolated `SHEP_HOME`. No Storybook.

| Folder  | What                                                                              |
| ------- | --------------------------------------------------------------------------------- |
| `cli/`  | One MP4, GIF, final-screen PNG and plain-text transcript per `shep learn` scene   |
| `tui/`  | `shep tui`: the learned-harness decision view (`d`) and the new-feature view (`N`) |
| `ui/`   | Screenshots of each step of a clicked-through `shep ui`, plus the video walk      |
| `demo/` | The scripts that produced all of it, so anyone can replay them                    |

## What is real and what is seeded

- **Real**: the CLI, the TUI, the web UI, SQLite, the git repository, the use cases and every
  state change you see. Importing a hand-written harness (`shep learn adopt --from-dir`),
  adopting from the TUI, rolling back and adopting again on the web, and the settings and Explore
  toggles all go through the shipped code.
- **Agent**: the built-in `dev` agent type (no account needed). It invents feature names, which is
  why one feature in the TUI has a made-up name.
- **Seeded** (`demo/seed-history.mjs`, not recorded):
  - five merged runs on v0 and five rough runs on v1, so v1 reads as *Regressed*;
  - a Reflect candidate built on v1 (a skill, a script and a guardrail) with its edit verdicts and
    a lesson.

  A real Reflect run needs a coding agent that edits the workspace, which the `dev` agent does not
  do. The end-to-end test `tests/integration/infrastructure/harness-learning/self-learning-loop.test.ts`
  covers that path with a mock agent. The candidate is then offered through the real
  `OfferHarnessCandidateUseCase`, which files the inbox decision the TUI answers.

## The story

1. **CLI** (`cli/01`):
   - the repository runs on a hand-imported v0;
   - a person imports v1 from a folder;
   - one feature is created with `--explore-harness --explore-k 2`.
2. **CLI** (`cli/02`, `cli/03`):
   - five runs later v1 is flagged *Regressed*;
   - Reflect proposed a candidate, and `learn show` / `learn diff` explain it.
3. **TUI** (`tui/`):
   - the console shows the waiting harness change;
   - `d` opens it with its diff, and `a` adopts it;
   - `N` opens the new-feature view, with Explore on and k = 2.
4. **Web** (`ui/`):
   - the Learning page shows the adopted candidate, the regressed v1, the runs-code warning and
     the edit verdicts;
   - roll back (with confirmation), then adopt again;
   - lessons;
   - Settings → Self-learning, with the mode changed to Reflect;
   - the create drawer's Explore toggle;
   - the repository drawer's Learning link.

## Replay

```bash
pnpm build:release
CHROMIUM=/path/to/chromium bash .github/pr-assets/self-learning/demo/capture-all.sh
```

`capture-all.sh` runs these in order:
- `00-setup.sh`;
- the CLI scenes, through `record-terminal.mjs`, which runs each in a pseudo-terminal and draws it
  with xterm.js in Chromium;
- `seed-history.mjs`;
- the TUI walk (`tui-steps.json`);
- `capture-ui.mjs` against `shep ui --port 4050`.

Defaults are `DEMO_DIR=/tmp/shep-learn-demo` and `SHEP_HOME=/tmp/shep-learn-home`. The scenes set
`DO_NOT_TRACK=1`, so no usage metrics are sent. `CHROMIUM` is only needed when Playwright's own
browser is not installed. `ffmpeg` turns the recordings into MP4 and GIF.
