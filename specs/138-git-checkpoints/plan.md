## Status

- **Phase:** Planning
- **Updated:** 2026-10-11

## Architecture Overview

```
 feature-agent worker ──resolves──▶ CaptureFeatureCheckpointUseCase
      │ graph deps.checkpoints (CheckpointCapture)          │
      ▼                                                     ▼
 withCheckpoint(node) ── ensureBaseline / capture ──▶ IGitCheckpointService ──▶ git plumbing
                                                     IGitCheckpointRepository ─▶ git_checkpoints

 CLI feat checkpoints|diff|restore ─┐
 web Checkpoints tab (server actions)├─▶ List / GetDiff / Restore use cases ─▶ same two ports
                                    ┘
 Cleanup / Delete / Archive use cases ─▶ DeleteFeatureCheckpointsUseCase ─▶ update-ref -d + rows
```

Layers follow Clean Architecture (dependencies point inward):

- **Domain** (`domain/shared/git-checkpoint.ts`): ref naming, node-name validation, step
  selector resolution, "previous checkpoint". Pure, extensionless imports (web consumes it).
- **Application**: two ports and five use cases. Use cases never touch git or SQL directly.
- **Infrastructure**: `GitCheckpointService` (plumbing through the injected `ExecFunction`,
  LRU diff cache), the SQLite repository, migration 170, DI module.
- **Pipeline**: `withCheckpoint` wraps file-changing nodes in all three graph factories; the
  callback is an optional dependency the worker supplies, so graphs stay testable without git.

## Implementation Strategy

**MANDATORY TDD**: All phases with executable code follow RED-GREEN-REFACTOR cycles.

The model comes first because every layer types against it. Domain helpers come next because
both the use cases and the web package use them. The git adapter is proven against real git
before any caller depends on it — the plumbing is the riskiest part, and the real-git
integration test is the only test that can fail for the right reasons. Use cases are tested
with in-memory doubles of the two ports, then DI wiring is proven by resolving every new token
in the bootstrap test. Pipeline wiring and cleanup hooks come after the use cases exist; CLI
and web are thin shells over the same three read/restore use cases and can be built in
parallel.

The unified-diff parser is extracted from `GitPrService` before the adapter needs it, and the
GitHub review service's hand-copied hunk parser is pointed at it in the same change, so the
feature removes a duplication instead of adding a third copy.

## Testing Strategy (TDD: Tests FIRST)

### Unit Tests

- Domain: ref building/validation (rejects `..`, spaces, uppercase, path separators), selector
  resolution by sequence / node / label, ambiguity and not-found errors, previous checkpoint.
- Use cases with fake ports: capture skips unchanged trees, baseline only when empty,
  sequence numbering, stats against the previous tree; diff defaults `from` to the previous
  step; restore refuses (no worktree, worktree == repo, not linked, agent pending/running) and
  captures pre-restore before restoring; delete removes refs then rows.
- `withCheckpoint`: baseline before, capture after, capture after a throwing node, no-op
  without a callback, capture errors swallowed.
- CLI commands: output for list/diff/restore and error paths (exit code 1, no throw).
- Web components via Testing Library; tab visibility.

### Integration Tests (real git, isolated config)

- `GitCheckpointService`: capture leaves `git status`, HEAD, branch and real index unchanged;
  untracked files captured, ignored files not; ref visible from the main repository; diff and
  stat between two checkpoints; restore makes the tree equal and keeps ignored files and the
  branch; `isLinkedWorktree` true for a linked worktree and false for the main checkout;
  deleteRefs removes only the feature's refs. Worktree path contains a space.
- Repository round-trip on the migrated SQLite schema (non-default values, ordering, delete).
- DI bootstrap resolves every new token.

## Risk Mitigation

| Risk | Mitigation |
| ---- | ---------- |
| Capture slows or breaks a run | Best-effort with logging; skip when unchanged; a failure never propagates |
| Restore hits the user's checkout | Path inequality + git linked-worktree check + no running agent; integration test on the main checkout refuses |
| Ambient git config (signing, identity, global remotes) changes behaviour | `--no-gpg-sign`, fixed author env, tests isolate global/system config |
| Windows paths | Paths compared after normalisation; temp index under `os.tmpdir()`; integration test runs on windows-latest |
| Migration number collides with an open PR | 170 now; re-check `main` before merge |

---

_Updated by `/shep-kit:plan` — see tasks.yaml for detailed task breakdown_
