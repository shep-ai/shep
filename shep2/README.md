# Shep 2

Go to sleep with issues. Wake up with pull requests.

A self-contained Cargo workspace for Shep 2 (spec: [`specs/151-shep-2`](../specs/151-shep-2/),
design and video: [`specs/151-shep-2/design`](../specs/151-shep-2/design/)). It shares nothing
with Shep 1's pnpm workspace.

| Crate | Layer | Holds |
| ----- | ----- | ----- |
| `shep-domain` | Domain | Task, its five states, sources, review actions, settings. No I/O. |
| `shep-app` | Application | The four core actions (`add`, `start`, `board`, `review`) behind `ShepApi`, and port traits |
| `shep-jsonrpc` | Transport | JSON-RPC 2.0 over a user-only Unix socket, one message per line. Knows nothing about Shep. |
| `shep-rpc` | Presentation | The daemon protocol: methods, server, `RemoteShep` client, OpenRPC schema |
| `shep-infra` | Infrastructure | SQLite store, clock, file layout, background processes; later git, agents, sources, keychain |
| `shep-cli` | Presentation | The `shep` binary: the four commands and the daemon (`shep __daemon`, hidden) |

Dependencies point inward, and the crate graph enforces it.

```bash
cargo test --workspace
cargo clippy --all-targets -- -D warnings
cargo run -p shep-cli -- add "#412"
```

## The daemon

`shep go` starts a background daemon that owns the database and serves every surface over
JSON-RPC on `$SHEP_HOME/shep2/run/daemon.sock` (directory `0700`, socket `0600`). Every other
command talks to the daemon when it answers, and to the database directly when it does not.

The protocol is published as OpenRPC in [`schema/openrpc.json`](schema/openrpc.json), generated
from the Rust types. A test fails if a method, field or enum variant disappears. After adding
to the protocol, refresh the file:

```bash
SHEP_UPDATE_SCHEMA=1 cargo test -p shep-rpc --test schema
```

Try it from a shell:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"board","params":{}}' | nc -U ~/.shep/shep2/run/daemon.sock
```

State lives in `$SHEP_HOME/shep2.db` (default `~/.shep/shep2.db`); everything else Shep 2 writes
is under `$SHEP_HOME/shep2/`, apart from Shep 1's files in the same home.
