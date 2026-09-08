# Shep CLI Reference for Workstream Execution

Only the commands relevant to planning and running parallel workstreams. Run `shep <group> --help`
for the authoritative surface on the installed version.

---

## `shep feat new <description>` — create a workstream

Creates a git branch **and an isolated worktree off the repository's default branch**, then spawns
an agent in that worktree. This is shep's worktree-per-workstream primitive — never hand-roll
`git worktree add` next to it.

| Flag | Effect |
| --- | --- |
| `-r, --repo <path>` | Repository path (defaults to current directory) |
| `--remote <url>` | GitHub URL or `owner/repo` — clones (or forks) first. Conflicts with `--repo` |
| `--parent <fid>` | Parent feature id, full or partial prefix. See **Dependencies** below |
| `--pending` | Create the feature **without** spawning the agent. Release later with `feat start` |
| `--attach <path>` | Attach a file to the feature. **Repeatable** — use it for every source doc |
| `--push` | Push the branch to remote after implementation |
| `--pr` | Open a PR on implementation complete (implies `--push`) |
| `--no-pr` | Do not open a PR |
| `--allow-prd` | Auto-approve through requirements, pause after |
| `--allow-plan` | Auto-approve through planning, pause at implementation |
| `--allow-merge` | Auto-approve the merge phase |
| `--allow-all` | Fully autonomous — no approval pauses |
| `--fast` / `--no-fast` | `--fast` (default on) implements directly from the prompt. `--no-fast` runs the full SDLC: analyze → requirements → plan → implement |
| `--explore` | Exploration/prototyping session for iterative design. Conflicts with `--fast` |
| `--model <model>` | LLM model identifier for this run |
| `--no-rebase` | Skip syncing the default branch from remote before branching |
| `--inject-skills` / `--no-inject-skills` | Copy curated skills into the worktree |

### Mode selection for workstreams

- **Foundation and contract work** → `--no-fast`. Getting shared types and API contracts wrong is
  the expensive mistake; make the agent go through requirements and planning.
- **Well-specified leaf workstreams** → `--fast` (default). The plan already did the thinking.
- **Genuinely unknown shape** → `--explore` first, then `shep feat promote <id>` to convert the
  prototype into an implementation feature.

### Approval gates for workstreams

Leaving gates closed means the agent pauses and waits for you. With five in-flight workstreams
that is five things queued on your attention. Set gates by merge risk:

- **Low risk, disjoint subtree** → `--allow-all` and review at the PR.
- **Medium risk** → `--allow-plan`, so you see the plan before implementation begins.
- **High risk / foundation** → no auto-approval flags. Review every gate.

---

## Dependencies: `--parent`

`--parent <fid>` is a first-class dependency edge, not just metadata:

1. The child is created in the `Blocked` lifecycle and no agent spawns.
2. When the parent completes (`Maintain` — its branch merged), shep automatically
   **rebases the child's branch onto the parent's branch** and **spawns the child's agent**.
3. Only **direct** children are evaluated. In a chain A → B → C, C stays blocked until B itself
   reaches the gate — the cascade is one link at a time.
4. Cycles are rejected at creation time.
5. A child inherits the parent's repository path.

`--parent` combined with `--pending` defers the gate check to `shep feat start` — use it when you
want a dependency edge *and* manual release control.

`Pending` and `Exploring` parents never unblock children.

---

## Staging waves: `--pending` + `shep feat start`

```bash
shep feat new "<workstream>" --repo <path> --pending    # created, not running
shep feat start <id>                                    # spawn now
```

Use this when a workstream is *technically* unblocked but you lack review capacity. It keeps the
plan encoded in shep rather than in your head.

---

## Monitoring

| Command | Use |
| --- | --- |
| `shep feat ls` | Tree view: repo → feature → children, with lifecycle and current phase |
| `shep feat ls -r, --repo <path>` | Scope to one repository |
| `shep feat ls --show-archived` | Include archived features |
| `shep feat show <id>` | Full detail, including what the feature is waiting on |
| `shep feat logs <id>` | Agent output |
| `shep feat logs <id> -f` | Follow. `-n, --lines <count>` to limit history |
| `shep status` | Overall status |
| `shep agent ls` / `shep agent show <id>` | Agent-run level detail |

Feature ids accept partial prefixes (the 8-character prefix shown in `feat ls` is enough).

---

## Driving features forward

| Command | Use |
| --- | --- |
| `shep feat approve [id]` | Clear the current approval gate |
| `shep feat reject [id]` | Send the phase back |
| `shep feat feedback <id> <feedback>` | Give the agent corrective direction |
| `shep feat review [id]` | Trigger merge review |
| `shep feat resume <id>` | Resume a stopped or failed feature agent |
| `shep feat promote <id> [--fast]` | Promote an exploration into an implementation feature |
| `shep feat adopt <branch> [-r <path>]` | Bring an existing branch under shep management |
| `shep feat archive <id>` / `shep feat unarchive <id>` | Park a finished workstream |
| `shep feat del <id> [-f] [--no-cleanup] [--no-close-pr]` | Delete a feature and its worktree |

---

## Lifecycle values

`Started` · `Analyze` · `Requirements` · `Research` · `Planning` · `Implementation` · `Review` ·
`Maintain` · `Blocked` · `Pending` · `Exploring` · `Deleting` · `AwaitingUpstream` · `Archived`

The unblock gate is `Maintain` — a child is released only once its parent's branch has merged.

---

## Repositories

```bash
shep repo ls                          # tracked repositories
shep repo show <id>
shep repo add --url <url> [--dest <path>]
shep repo init-remote [name]          # create a GitHub repo and wire the remote
```

---

## Tracking the plan as work items

For efforts large enough that the plan must outlive the terminal session, mirror the workstream
graph in shep's PM layer. The blocking relation is the durable form of your dependency graph.

```bash
shep project new -n "V6" -p V6 -d "V6 milestone"
shep project ls
shep project show <slug>

shep item new <project> -t "Foundation: contracts + shared types" -p urgent \
  -d "See WORKSTREAMS.md#foundation"
shep item new <project> -t "Creator storefront" -p high
shep item ls <project>

# Dependency edges — source blocks target
shep item relate V6-1 V6-2 --type blocking
```

Relation types: `blocking`, `relates-to`, `duplicate`, `starts-before`, `finishes-before`.

Sub-items: `shep item new <project> --parent PROJ-42`.

Waves map cleanly onto cycles:

```bash
shep cycle new <project> -n "Wave 1 — Foundation" -s 2026-01-06 -e 2026-01-17
shep cycle add-items <cycle-id> <item-id> <item-id>
shep cycle show <cycle-id>
shep cycle transfer <source> [target] # move incomplete items to another cycle
shep item export <project> -o <file>  # export work items as CSV
```
