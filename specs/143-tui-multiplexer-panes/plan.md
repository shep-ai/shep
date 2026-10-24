## Status

- **Phase:** Planning
- **Updated:** 2026-10-24

## Architecture Overview (Clean Architecture)

```
shep tui ── t/T/f/F ──► OpenFeaturePaneUseCase (application)
                            ├─ IFeatureRepository (find by id or prefix)
                            ├─ IWorktreePathProvider + IFileSystemService (directory)
                            └─ ITerminalPaneLauncher (port)
                                  ├─ detect()  → domain detectTerminalMultiplexer(env)
                                  └─ open()    → infrastructure argv builders → ExecFunction
         ◄── Opened | Inline{cwd, command} | Failed
Inline → app stops the TUI, runs the command with inherited stdio, restarts
/ ──► filterConsoleRows (application, pure)
snapshot diff ──► terminalNotification(env) → BEL / OSC, tmux passthrough
```

Dependencies point inward: the presentation layer reaches the launcher only through the use
case, and the use case only through its port.

## TDD

Every core task starts RED: detector, argv builders, adapter, use case and filter each get a
failing test first, then GREEN, then REFACTOR. The view and app are driven by the existing
fake terminal. The tmux e2e runs the built CLI in a real tmux server.
