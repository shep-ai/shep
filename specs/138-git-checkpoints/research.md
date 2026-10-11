## Status

- **Phase:** Research
- **Updated:** 2026-10-11

## Technology Decisions

### Snapshot mechanism

**Options considered:** temporary index + plumbing (T3's approach), `git stash create`,
a real side-branch commit, a home-grown file store.

**Decision:** temporary `GIT_INDEX_FILE` → `read-tree HEAD` → `add -A` → `write-tree` →
`commit-tree -p HEAD` → `update-ref refs/shep/checkpoints/<featureId>/<seq>-<node>`, each with
`-c core.fsync=objects,reference`. Author/committer are fixed through environment variables
(`Shep <shep@localhost>`) and `--no-gpg-sign` is passed, so capture never depends on the
user's identity or signing configuration. On an unborn HEAD `read-tree --empty` is used and
the commit has no parent.

A prototype against git 2.43 confirmed: `git status --porcelain` is identical before and after
capture (staged, modified and untracked files all intact); ignored directories are not
captured; a ref written from a linked worktree is visible from the main repository, because
only `HEAD`, `refs/worktree/*`, `refs/bisect/*` and `refs/rewritten/*` are per-worktree.

### Hook point

The three graph factories (full, fast, exploration) wrap file-changing nodes with
`withCheckpoint`. The callback is an optional graph dependency, so every existing graph test
keeps compiling and behaves as before. Before the wrapped node runs, the callback ensures a
`baseline` exists; after it (in `finally`) it captures the node's result. Capture failures are
logged and swallowed — a checkpoint is never worth failing a feature run.

Wrapped nodes — full graph: analyze, requirements, research, plan, implement, the four repair
nodes, merge. Fast graph: fast-implement, merge. Exploration graph: prototype-generate.
Validate nodes and extract_memory only read files and are not wrapped.

### Restore

`pre-restore` capture, then `git clean -fd` → `git read-tree --reset -u <tree>` →
`git reset -q`. Result (prototype-verified): worktree content equals the checkpoint tree,
ignored files are untouched, the index equals HEAD, the branch and its history are unchanged.

### Cleanup

`git for-each-ref --format=%(refname) refs/shep/checkpoints/<featureId>/` then
`git update-ref --stdin` with one `delete` per ref, run from `repositoryPath` (the worktree may
already be gone), then delete the rows. Called from CleanupFeatureWorktreeUseCase,
DeleteFeatureUseCase and ArchiveFeatureUseCase, best-effort.

## Library Analysis

| Library | Version | Purpose | Pros | Cons |
| ------- | ------- | ------- | ---- | ---- |
| git CLI (via injected `ExecFunction`) | ≥ 2.25 | plumbing | already the only git dependency; Windows-safe spawn | none |

No new third-party dependency.

## Security Considerations

- Every ref component is validated: the feature id is a UUID and the node name must match
  `^[a-z0-9][a-z0-9_-]*$`; `assertSafeGitRef` is applied to the full ref before any git call.
- Step selectors from the CLI/web are resolved against the feature's own rows, never passed to
  git, so a user cannot read an arbitrary ref or another feature's checkpoint.
- Restore runs only inside a verified linked worktree with no running agent (see decisions).
- Diff output is bounded by the existing `DIFF_MAX_BUFFER_BYTES` maxBuffer.

## Performance Implications

- `add -A` hashes changed files only (git reuses stat data from the index read from HEAD), so
  a capture costs about as much as `git status` plus writing new blobs; typically well under a
  second, and at most ~12 captures per full run.
- Objects are shared with the branch, so a checkpoint whose files were then committed costs no
  extra disk.
- Diffs are computed on demand and cached (LRU of 32 entries) in the long-lived web/daemon
  process.

## Open Questions

All questions resolved.

---

_Updated by `/shep-kit:research` — proceed with `/shep-kit:plan`_
