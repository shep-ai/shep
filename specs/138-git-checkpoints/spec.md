## Problem Statement

A feature run is a sequence of agent steps, but Shep only keeps the end result: the branch.
Agents commit when they like (or not at all), repair loops rewrite spec files, and the CI-fix
loop pushes follow-up commits. A user cannot answer "what did *implement* change, and what did
*repair* change after it?", cannot compare the spec after *plan* with the code after *merge*,
and cannot undo one bad step without hand-editing git. T3 Code solves the same problem with a
snapshot per turn stored under a hidden ref, built through a temporary index so the user's
branch and staging area are never touched. Shep's features already run in isolated worktrees,
so the same mechanism is nearly free here.

## Success Criteria

- [ ] After every worktree-changing node of the full, fast and exploration graphs, a commit
      exists at `refs/shep/checkpoints/<featureId>/<seq>-<node>` whose tree equals the worktree
      (tracked + untracked, `.gitignore` respected). A baseline (`0000-baseline`) is captured
      before the first step. A step whose tree equals the previous checkpoint's tree records
      nothing.
- [ ] Capture never changes the branch, `HEAD`, the real index or any working-tree file
      (real-git integration test asserts all four), uses `core.fsync=objects,reference`, never
      signs, and never fails a node: a capture error is logged and the run continues.
- [ ] Each checkpoint is a `GitCheckpoint` row: feature, agent run, sequence, node, ref, commit,
      tree, branch HEAD at capture, files changed / additions / deletions versus the previous
      checkpoint, and time.
- [ ] `shep feat checkpoints <id>` lists the steps; `shep feat diff <id> --to <step>` shows what
      one step changed and `--from <a> --to <b>` compares any two (step = sequence number, node
      name or ref label). `--stat` prints only the file summary.
- [ ] The feature drawer has a Checkpoints tab: a step list, the per-step diff of the selected
      step (reusing the merge-review `DiffView`), a compare mode for any two steps, and a
      Restore action with confirmation. Strings exist in all 9 locales; components have stories.
- [ ] Restore (`shep feat restore <id> <step>`, and the web action) makes the worktree match
      the checkpoint exactly (removes extra untracked files, keeps ignored files), leaves the
      branch and its history alone, and first captures a `pre-restore` checkpoint so a restore
      can itself be undone. It refuses when the target is not a linked worktree distinct from
      the repository's main checkout, or while the feature's latest agent run is pending or
      running.
- [ ] Diffs between two checkpoints are cached in-process (checkpoints are immutable).
- [ ] Removing the feature's worktree (post-merge cleanup, delete) and archiving the feature
      delete its refs and rows, best-effort, without failing the outer operation.
- [ ] Integration tests run real git with `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` isolated and
      `commit.gpgsign=false`, and cover a path with spaces plus Windows path normalisation.

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `tsp/agents/git-checkpoint.tsp` | High | New `GitCheckpoint` entity (TypeSpec-first) |
| `application/ports/output` | High | `IGitCheckpointService` (git plumbing), `IGitCheckpointRepository` |
| `application/use-cases/features/checkpoints/` | High | capture, list, diff, restore, delete |
| `infrastructure/services/git/` | High | `GitCheckpointService` adapter; shared unified-diff parser extracted from `GitPrService` / GitHub review |
| `infrastructure/persistence/sqlite` | Medium | migration 170 `git_checkpoints`, mapper, repository |
| Feature-agent graphs + worker | Medium | `withCheckpoint` node wrapper, wired by the worker through DI |
| Cleanup / delete / archive use cases | Low | delete checkpoints on worktree removal and archive |
| CLI `feat` commands | Medium | `checkpoints`, `diff`, `restore` |
| Web feature drawer | Medium | Checkpoints tab, server actions, Storybook mocks, 9 locales |

## Dependencies

None blocking. Migration number: 169 is reserved by cleanup PR 925, so this feature takes 170
(re-checked against `main` at merge time).

## Size Estimate

**L** — one new entity, two ports, five use cases, a git adapter, a migration, graph wiring,
three CLI commands and a drawer tab, each with tests; no new third-party dependencies.

## Decisions taken while scoping

- **Baseline.** Diffing the first step needs a "before"; a `baseline` checkpoint is captured
  the first time a worktree-changing node is about to run for a feature with no checkpoints.
- **Skip unchanged.** Capturing after a node that changed nothing (a validate pass, a merge
  that only polled CI) would add noise, so a tree equal to the latest checkpoint's is skipped.
- **Restore does not move the branch.** The agent pushes the branch; rewinding it would make
  the next push non-fast-forward. Restore rewrites the working tree only, so the rollback is
  an ordinary change the next step commits, and a `pre-restore` checkpoint makes it undoable.
- **"Agent running"** means the latest run is `pending` or `running`. A run parked at an
  approval gate is not executing, and restoring before rejecting is a useful flow.

---

_Generated by `/shep-kit:new-feature` — proceed with `/shep-kit:research`_
