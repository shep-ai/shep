# Shep 2

Go to sleep with issues. Wake up with pull requests.

A self-contained Cargo workspace for Shep 2 (spec: [`specs/151-shep-2`](../specs/151-shep-2/),
design and video: [`specs/151-shep-2/design`](../specs/151-shep-2/design/)). It shares nothing
with Shep 1's pnpm workspace.

| Crate | Layer | Holds |
| ----- | ----- | ----- |
| `shep-domain` | Domain | Task, its five states, sources, review actions, settings. No I/O. |
| `shep-app` | Application | The four core actions (`add`, `start`, `board`, `review`) and port traits |
| `shep-infra` | Infrastructure | SQLite store, clock; later git, agents, sources, keychain |
| `shep-cli` | Presentation | The `shep` binary: CLI now; daemon, terminal UI and MCP next |

Dependencies point inward, and the crate graph enforces it.

```bash
cargo test --workspace
cargo clippy --all-targets -- -D warnings
cargo run -p shep-cli -- add "#412"
```

State lives in `$SHEP_HOME/shep2.db` (default `~/.shep/shep2.db`).
