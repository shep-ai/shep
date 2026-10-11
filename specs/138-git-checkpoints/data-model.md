# Data Model: git-checkpoints

> Entity definitions for 138-git-checkpoints

## Status

- **Phase:** Implementation
- **Updated:** 2026-10-11

## Overview

One new entity records each hidden-ref worktree snapshot. The git objects and refs themselves live
in the repository; the row is the index that the CLI and web read.

## New Entities

### GitCheckpoint

**Location:** `tsp/agents/git-checkpoint.tsp` — table `git_checkpoints` (migration 170),
`UNIQUE (feature_id, sequence)`.

| Property     | Type              | Required | Description                                                 |
| ------------ | ----------------- | -------- | ----------------------------------------------------------- |
| featureId    | string            | yes      | Feature the checkpoint belongs to                           |
| agentRunId   | string            | no       | Run that produced the step                                  |
| sequence     | int32             | yes      | Position; the baseline is 0                                 |
| kind         | GitCheckpointKind | yes      | Baseline, Step or PreRestore                                |
| node         | string            | yes      | Graph node name, `baseline` or `pre-restore`                |
| ref          | string            | yes      | `refs/shep/checkpoints/<featureId>/<seq>-<node>`            |
| commitSha    | string            | yes      | Checkpoint commit                                           |
| treeSha      | string            | yes      | Worktree content at capture time                            |
| headSha      | string            | no       | Branch HEAD at capture time (absent on an unborn branch)    |
| filesChanged | int32             | yes      | Files changed versus the previous checkpoint                |
| additions    | int32             | yes      | Lines added versus the previous checkpoint                  |
| deletions    | int32             | yes      | Lines deleted versus the previous checkpoint                |

**Relationships:**

- Belongs to a Feature (`featureId`); deleted with the feature's worktree or when it is archived.

## Modified Entities

None.

## Enums

- `GitCheckpointKind` — Baseline, Step, PreRestore.
- `CheckpointRestoreBlocker` — NoOwnWorktree, NotLinkedWorktree, WorktreeUnavailable,
  AgentRunning: why a restore would be refused right now.
