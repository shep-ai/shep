# Git Checkpoints

After each feature-agent step that can change files, Shep snapshots the feature's worktree into a
hidden git ref (spec 138). Each step's changes can then be diffed on their own, any two steps can
be compared, and the worktree can be rolled back to a step. These are not the LangGraph
checkpoints (`IAgentCheckpointService`), which store the graph's state, not files.

## Where they live

```
refs/shep/checkpoints/<featureId>/0000-baseline
refs/shep/checkpoints/<featureId>/0001-analyze
refs/shep/checkpoints/<featureId>/0005-implement
refs/shep/checkpoints/<featureId>/0006-repair_research
refs/shep/checkpoints/<featureId>/0007-pre-restore
```

- **Hidden refs.** They are not under `refs/heads` or `refs/tags`, so `git branch` and `git log`
  ignore them, and `git push` never sends them.
- **Shared ref store.** Refs written from a linked worktree go to the repository's common ref store.
  The main checkout can read them, and they outlive the worktree until cleanup deletes them.
- **Database rows.** Each checkpoint is a `GitCheckpoint` row in `git_checkpoints` (migration 170).
  It holds the node, sequence, ref, commit, tree, the branch `HEAD` at capture time, and the change
  summary against the previous checkpoint.

## Capture

`GitCheckpointService.snapshotWorktree` uses a temporary `GIT_INDEX_FILE`, as T3 Code does:

1. Copy the real index into a temporary file, or `read-tree HEAD` / `read-tree --empty` when there
   is no index. Copying lets git reuse its stat cache instead of re-hashing every file.
2. `git add -A`, then `git write-tree`. The tree holds every tracked and untracked file that
   `.gitignore` does not exclude.
3. `git commit-tree -p HEAD` with a fixed `Shep` identity and `--no-gpg-sign`, then `update-ref`.
   Both run with `-c core.fsync=objects,reference`.

The branch, `HEAD`, the real index and the working tree are never touched. A real-git integration
test checks all four.

### When a capture happens

The graph factories wrap every node that can change files with `withCheckpoint` (`nodes/with-checkpoint.ts`):

| Graph       | Wrapped nodes                                                          |
| ----------- | ---------------------------------------------------------------------- |
| Full        | analyze, requirements, research, plan, implement, the four repair nodes, merge |
| Fast        | fast-implement, merge                                                  |
| Exploration | prototype-generate                                                     |

- **Before a node.** The first time a wrapped node runs for a feature, a `baseline` checkpoint is
  captured.
- **After a node.** A checkpoint is captured even if the node fails or stops at an approval gate
  (LangGraph's `interrupt()` throws), so partial work is kept.
- **Unchanged tree.** When the tree equals the latest checkpoint's tree, nothing is recorded: the
  step changed nothing.
- **Failures.** A capture failure never fails a run. The worker's recorder (`checkpoint-capture.ts`)
  logs it and the node's result is returned unchanged.

Validate nodes and `extract_memory` only read files, so they are not wrapped.

## Diff

`GetFeatureCheckpointDiffUseCase` runs `git diff --find-renames` between two checkpoint commits.

- **Choosing the steps.** With only `to`, it compares against the checkpoint before `to`, which
  shows what that one step changed. With `from` as well, it compares any two steps.
- **Step selectors.** A step is given as a sequence number (`3`), a node name (`implement`, meaning
  the latest checkpoint of that node), or a label (`0003-implement`).
- **Caching.** Checkpoints are immutable, so diffs are cached in-process (an LRU of 32 entries).
- **Diff format.** The output is parsed by the shared `unified-diff.parser.ts`, the same parser the
  merge review uses.

## Restore

`RestoreFeatureCheckpointUseCase` makes the worktree match a checkpoint:

1. Capture a `pre-restore` checkpoint. A restore can be undone by restoring that checkpoint.
2. Run `git clean -fd`, then `git read-tree --reset -u <tree>`, then `git reset -q`.

The worktree's files then equal the checkpoint. Ignored files (`node_modules`, `.env`) are kept,
the index is back on `HEAD`, and the branch does not move. The rollback is an ordinary change that
the next step commits, so nothing already pushed is rewritten.

`CheckpointRestorePolicy` is the single place that decides whether a restore is allowed. The list
use case reports its answer as `restoreBlocker`, so every surface can show the reason before the
user asks. A restore is refused when:

| `CheckpointRestoreBlocker` | Condition                                                                      |
| -------------------------- | ------------------------------------------------------------------------------ |
| `NoOwnWorktree`            | No worktree path, or the path is the repository path (compared case-insensitively) |
| `NotLinkedWorktree`        | git does not report the directory as a linked worktree                         |
| `WorktreeUnavailable`      | git cannot read the directory (for example, it was removed)                    |
| `AgentRunning`             | The latest agent run is `pending` or `running`                                 |

A run waiting for approval is not executing, so a restore is allowed while it waits.

## Cleanup

`DeleteFeatureCheckpointsUseCase` deletes every ref under the feature's prefix from the repository
path, then deletes the rows. It runs from the repository path because the worktree may already be
gone. These callers use it, best-effort:

- `CleanupFeatureWorktreeUseCase` (after merge)
- `DeleteFeatureUseCase`
- `ArchiveFeatureUseCase`, including auto-archive

## Surfaces

| Surface | How                                                                       |
| ------- | ------------------------------------------------------------------------- |
| CLI     | `shep feat checkpoints <id>`, `shep feat diff <id> --to <step> [--from <step>] [--stat]`, `shep feat restore <id> <step> [--force]` |
| Web     | Feature drawer → **Checkpoints** tab: the step list, the per-step diff, a two-step comparison and restore with confirmation |

## Key files

| Layer          | File                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| TypeSpec       | `tsp/agents/git-checkpoint.tsp`                                          |
| Domain         | `domain/shared/git-checkpoint.ts`, `domain/errors/git-checkpoint-errors.ts` |
| Ports          | `ports/output/services/git-checkpoint-service.interface.ts`, `ports/output/repositories/git-checkpoint-repository.interface.ts` |
| Use cases      | `application/use-cases/features/checkpoints/`                            |
| Infrastructure | `services/git/git-checkpoint.service.ts`, `repositories/sqlite-git-checkpoint.repository.ts`, `di/modules/register-git-checkpoints.ts` |
| Pipeline       | `feature-agent/nodes/with-checkpoint.ts`, `feature-agent/checkpoint-capture.ts` |
