# Shep 2

Go to sleep with issues. Wake up with pull requests.

## Try it now

There is no release yet, so the commands under [Install](#install) start working with the first
`shep2-v*` tag. Until then, install what CI built for the Shep 2 branch (macOS or Linux):

```bash
gh api -H 'Accept: application/vnd.github.raw' 'repos/shep-ai/shep/contents/shep2/dist/try.sh?ref=claude/magical-heisenberg-fa1drb' | sh -s -- --app
```

It needs the GitHub CLI signed in (`gh auth login`). It puts `shep` in `~/.local/bin` and, on a
Mac, `Shep.app` in `~/Applications`. Run it again to get the newest build; a daemon still
running the old one is replaced on your next `shep` command.

Then, in a repository you are happy to get draft pull requests on:

1. Run `shep`. The first run walks you through where your tasks live, the coding agent (Claude
   Code, Codex or Gemini CLI, with your own login), GitHub, the repository and when to work,
   then starts a first task: pick one of your open issues or describe one.
2. Watch it work: `1` is the board, `2` the split view with the agent's live terminal (`enter`
   to type to the agent, `ctrl-]` to step out), `3` the night sky. `q` leaves; work goes on.
3. When it is Ready, its draft pull request is on GitHub. `m` merges it, `s` sends it back with
   a note, `a` answers a question.

More: `shep add "#12"` or `shep add "Fix the typo on the pricing page"` queues a task, `shep go`
starts the queue now (`--at 23:00` for tonight), `shep config` shows and changes settings and
connects Linear, Jira, Notion, Monday or Slack (`shep config --connect linear`). From any agent
that speaks MCP, add `{"command": "shep", "args": ["mcp"]}` ([details](#from-your-coding-agent-mcp)).
The Mac app talks to the daemon that `shep` starts: `open ~/Applications/Shep.app`.

Shep keeps a daemon in the background; `pkill -f 'shep __'` stops it and any agents it runs.
Its files are `~/.shep/shep2.db` and `~/.shep/shep2/`; Shep 1's are left alone. If `shep
--version` says 1.x, Shep 1 comes first on your `PATH`: run `~/.local/bin/shep` instead.

## Install

Any one of these gives you the `shep` command on macOS (Apple silicon or Intel) or Linux
(x86_64 or arm64):

```bash
brew install shep-ai/tap/shep
curl -fsSL https://shep.bot/install | sh
npx shep2
```

The curl installer checks the download's SHA-256 and puts `shep` in `~/.local/bin`; set
`SHEP_INSTALL_DIR` to put it elsewhere or `SHEP_VERSION` to pin a version. `npm install -g shep2`
installs it for good. Then run `shep` in a repository.

Shep 1 (`@shepai/cli`) also installs a `shep` command; whichever comes first on your `PATH`
wins. How releases are built and published: [`dist/`](dist/README.md).

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
3. commits what the agent left and runs the repository's own screenshot command, if it has one
   (below);
4. merges `origin/<default>` into the task branch if it moved. A conflict goes back to the
   agent once, with the files both sides changed; if the agent cannot merge it, the task needs
   you ("Both sides changed …");
5. pushes the task branch (never the default branch) and opens a **draft** PR;
6. watches CI and sends failures back to the same conversation, up to three times, then the
   task needs you, naming the failing checks;
7. asks a second agent, in its own folder and conversation, for a review;
8. writes what changed, the proof, the CI timeline and the review into the PR, and the task is
   Ready. Merge merges it and removes the task's worktree and local branch; Send back starts
   another pass on the same PR.

The agent's own `git push` can reach its task branch only. Everything Shep runs in a worktree
gets `core.hooksPath` (through `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0`)
pointing at hooks Shep writes beside the worktree: `pre-push` refuses any other ref, and every
other hook runs the repository's own (its `core.hooksPath`, else `.git/hooks`), so the
project's pre-commit still runs for the agent. It stops mistakes, not intent:
`git push --no-verify` skips it, as it skips every pre-push hook.

While tasks wait or work, Shep also watches GitHub (each at most once a minute or five):

- **Send back from the PR.** A comment that starts with `shep:` on a Ready task's pull request
  sends the task back with the rest of the comment as its note, exactly like Send back. Only
  comments by the account `gh` is signed in as count; anyone else's are ignored. Several
  `shep:` comments since the task became Ready make one note.
- **A closed issue stops its task.** When the issue behind a Queued or Working task is closed,
  Shep stops the agent, closes the draft PR with a comment, removes the worktree (the branch
  stays) and takes the task off the board. The morning brief says "Stopped: … — issue closed".

### Screenshots from the repository's own command

A repository can take its own screenshots. Commit `.shep/dev.json` (the file Shep 1 reads for
its dev server; other keys are ignored) with a `screenshot` command:

```json
{ "screenshot": "pnpm screenshot" }
```

After the coder finishes, Shep runs it with `sh -c` in the task's worktree, in the PTY holder,
with `SHEP_PROOF_DIR` set (and made). Every PNG it saves there becomes proof: published on a
`shep/proof/<id>` branch and shown in the PR. A failing command, or one that runs over ten
minutes, is noted on the task and never holds it back. It should write only to
`$SHEP_PROOF_DIR`: anything else it leaves in the worktree is committed with the next pass.
Without the file, the agent is asked to save screenshots itself.

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

## From your coding agent (MCP)

Any agent that speaks MCP can hand work to Shep without you leaving it. Add Shep to the agent's
MCP config:

```json
{
  "mcpServers": {
    "shep": { "command": "shep", "args": ["mcp"] }
  }
}
```

Three tools, each calling one core action through the daemon (started if it isn't running):

| Tool | Arguments | What it does |
| ---- | --------- | ------------ |
| `add_task` | `{ text, when?: "now" \| "tonight" \| "HH:MM" }` | Queues an issue or a sentence; answers with its id and when it starts |
| `board` | `{}` | Counts per state and the open tasks, Needs you first |
| `review` | `{ id, action: "merge" \| "send-back" \| "answer", note? }` | Merges, sends back with a note, or answers a question |

The first task added from an agent makes the agent's working directory Shep's repository, like
`shep add` does. `shep mcp` is not one of the four commands; only an agent starts it.

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
| `shep2/tasks/<id>/` | Issue text, agent and screenshot-command logs, the question file, `proof/`, `review/`, CI logs |
| `shep2/worktrees/<repo>/` | One git worktree per task, and its push-guard hooks beside it (`<worktree>.hooks/`) |

Tests speed the engine up with `SHEP_ENGINE_TICK_MS`, `SHEP_CI_POLL_SECS` and
`SHEP_CI_GRACE_SECS`.
