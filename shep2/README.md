# Shep 2

Go to sleep with issues. Wake up with pull requests.

A self-contained Cargo workspace for Shep 2 (spec: [`specs/151-shep-2`](../specs/151-shep-2/),
design and video: [`specs/151-shep-2/design`](../specs/151-shep-2/design/)). It shares nothing
with Shep 1's pnpm workspace.

| Crate | Layer | Holds |
| ----- | ----- | ----- |
| `shep-domain` | Domain | Task, its five states, sources, review actions, settings. No I/O. |
| `shep-app` | Application | The four core actions behind `ShepApi`, the run engine, prompts, the PR body, and port traits |
| `shep-jsonrpc` | Transport | JSON-RPC 2.0 over a user-only Unix socket, one message per line. Knows nothing about Shep. |
| `shep-rpc` | Presentation | The daemon protocol: methods, server, `RemoteShep` client, OpenRPC schema |
| `shep-infra` | Infrastructure | SQLite, git worktrees, `gh`, the PTY holder, agent CLIs, OSC 7501, keep-awake; later sources and keychain |
| `shep-cli` | Presentation | The `shep` binary: the four commands, the daemon and the holder (`__daemon`, `__holder`, hidden) |
| `shep-mock-model` | Test tooling | A scripted Anthropic Messages API for running the real Claude Code CLI without a key. Never shipped. |

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

## What happens to a task

`shep add "#412"` inside a repository queues the task and, the first time, points Shep at that
repository. `shep go` (or the shift start, `shep go --at 23:00`) starts queued tasks up to the
parallel limit and keeps filling free slots. For each task the daemon's engine:

1. reads the issue with `gh` and makes a worktree on `shep/<id>-<slug>` from `origin/<default>`
   (the person's checkout is never touched);
2. runs the chosen agent CLI unattended in the PTY holder, with a prompt that asks for proof in
   the task's folder and at most one question;
3. commits what the agent left, pushes the task branch (never the default branch) and opens a
   **draft** PR;
4. watches CI and sends failures back to the same conversation, up to three times, then the
   task needs you, naming the failing checks;
5. asks a second agent, in its own folder and conversation, for a review;
6. writes what changed, the proof, the CI timeline and the review into the PR, and the task is
   Ready. Merge merges it; Send back starts another pass on the same PR.

An agent that hits its usage limit is parked until the reset (read from its screen) and picks up
where it stopped. Agents run in the holder (`shep __holder`), a process of its own, so a daemon
restart or upgrade does not stop them; status comes over OSC 7501 when the agent reports it,
and from its screen otherwise. While anything works the machine is kept awake (`caffeinate`,
`systemd-inhibit`).

Verified end to end against a real git origin with a fake `gh`, two ways:

- a fake agent script (`crates/shep-cli/tests/e2e.rs`, runs everywhere);
- **the real Claude Code CLI against a mock model** (`crates/shep-cli/tests/real_claude.rs`):
  Shep's prompts, the PTY, Claude Code's flags, `--session-id`, `--resume`, its tools and exit
  codes are all real; only the model is scripted. No API key, no cost. Opt-in locally (needs
  `claude` on `PATH`), always on in CI:

  ```bash
  cargo test -p shep-cli --test real_claude -- --include-ignored
  ```

Not yet run against GitHub or a real model.

## Running Shep without an API key

`shep-mock-model` stands in for the Anthropic Messages API, so a real night can be rehearsed on
a throwaway repository with real `gh` and no model costs:

```bash
cargo run -p shep-mock-model                     # serves http://127.0.0.1:8765
export ANTHROPIC_BASE_URL=http://127.0.0.1:8765 ANTHROPIC_API_KEY=mock
shep add "#1" && shep go                         # from inside the throwaway repository
```

Each task gets one scripted step: it appends to `MOCK_CHANGE.md` and saves test proof; a CI fix
commits `MOCK_FIX.md`; the reviewer writes a short review; a task with `[mock:ask]` in its title
asks a question. Set `SHEP_MOCK_MODEL_LOG=<file>` to record every request.

Claude Code refuses `--dangerously-skip-permissions` as root unless `IS_SANDBOX=1` is set; Shep
does not set it for you. Run Shep as a normal user.

## Files

State lives in `$SHEP_HOME/shep2.db` (default `~/.shep/shep2.db`); everything else Shep 2 writes
is under `$SHEP_HOME/shep2/`, apart from Shep 1's files in the same home:

| Path | What |
| ---- | ---- |
| `shep2/run/` | Daemon and holder sockets (`0700`; `/tmp/shep2-<hash>` when the home is too deep) |
| `shep2/daemon.log`, `shep2/holder.log` | Background process logs |
| `shep2/tasks/<id>/` | Issue text, agent logs, the question file, `proof/`, `review/`, CI logs |
| `shep2/worktrees/<repo>/` | One git worktree per task |

Tests speed the engine up with `SHEP_ENGINE_TICK_MS`, `SHEP_CI_POLL_SECS` and
`SHEP_CI_GRACE_SECS`.
