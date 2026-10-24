# Evidence: command palette (spec 145)

A real run of the built CLI inside a tmux 3.4 client with three mock-executor features at their
gate (capture and replay as in spec 143's evidence).

| Frame | What it shows |
| --- | --- |
| `02-palette.png` | `:` then `window`: the palette narrows to "Open a window for every active feature" with its key `C`; enter ran it (see spec 146's `03-control-center.png`) |

`screens/02-palette.txt` is the plain-text screen. The e2e test
`tests/e2e/tui/feature-console.test.ts` opens the palette with ctrl+p, runs "Show keys" and
closes help again.
