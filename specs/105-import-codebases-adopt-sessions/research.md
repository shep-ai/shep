## Status

- **Phase:** Research
- **Updated:** 2026-08-03

## Summary

Most of this feature is wiring, not invention. Three findings changed the
plan relative to the spec:

1. **Adoption should not call `IAgentExecutorProvider` directly.** The spec
   named it, but `IStructuredAgentCaller` is the correct abstraction and
   `MetadataGenerator` is a working precedent for the exact same
   input-to-schema shape. Using the lower-level port would mean
   re-implementing JSON extraction and error handling that already exists.

2. **`CreateFeatureUseCase.execute()` cannot satisfy the "no branch" rule.**
   Phase 2 (`initializeAndSpawn`) always calls `worktreeService.create()`.
   The `pending` flag does not help either — it sets lifecycle to `Pending`,
   not `Requirements`. The answer is `createRecord()`, which is public,
   DB-only, defaults to `Requirements`, and is already used in this split
   fashion by the web create-feature action.

3. **Deleting `session-scanner.ts` is bigger than it looks.** The web
   scanner is *ahead* of core in three ways the canvas actively depends on.
   Sequencing matters: core has to catch up before the delete.

## Technology Decisions

### Where subfolder listing and git detection live

**Options considered:**

1. Extend `IFileSystemService` with `listSubdirectories()` + `isGitRepository()`
2. New `IRepositoryDiscoveryService` port with a `node:fs` adapter
3. Call `node:fs` directly from the use case

**Decision:** New `IRepositoryDiscoveryService` output port.

**Rationale:** `IFileSystemService` is intentionally minimal —
`removeDirectory` and `pathExists` — and is injected into eight use cases
across clusters, deployments, cloud-deploy, doctor, and repositories. Adding
enumerate semantics widens a port all of them would then over-depend on. A
dedicated port gives bulk import one mockable seam. Option 3 violates the
dependency rule outright.

### How adopted-session summarisation reaches the model

**Options considered:**

1. `IAgentExecutorProvider` + free-form output parsing (as the spec suggested)
2. `IStructuredAgentCaller.call()` with a JSON schema
3. Spawn a full feature agent run

**Decision:** `IStructuredAgentCaller.call()`, mirroring `MetadataGenerator`.

**Rationale:** `IStructuredAgentCaller` already abstracts native structured
output (Claude Code `--json-schema`) from prompt-based JSON extraction and
throws `StructuredCallError` on failure — which is exactly the trigger for
our deterministic fallback. `MetadataGenerator` shows the house pattern: a
module-level schema const, input truncation before the call, typed result
interface. Adoption adds one field (`remainingWork`) to that shape.

### How an adopted feature is created without a branch or agent run

**Options considered:**

1. `execute()`
2. `execute()` with `pending: true`
3. `createRecord()` with pre-supplied `name`/`description`
4. Direct `IFeatureRepository.create()`

**Decision:** `createRecord()`.

**Rationale:** Option 1 always creates a worktree. Option 2 lands in
`SdlcLifecycle.Pending` rather than `Requirements`. Option 4 skips slug
resolution, the agent-run record, and parent-gate logic. Option 3 is
documented as "No AI calls, no git operations — just DB writes", defaults to
`Requirements` for `BuildMode.Application`, and accepts pre-supplied
name/description so the summariser output feeds straight in without a second
redundant AI call.

### Shape of the resume descriptor

**Decision:** A domain helper maps `AgentType` to its binary and builds a
descriptor (binary, args, cwd) consumed by the terminal, IDE, and clipboard
paths alike.

**Rationale:** `claude-code-executor.service.ts:373` and
`cursor-executor.service.ts:329` both already push `['--resume', id]`, but
Cursor's binary is `cursor-agent`. A hardcoded `claude --resume` breaks for
Cursor sessions as soon as parity lands. None of them take a `--project`
flag — cwd carries the project — which is exactly the shipped bug.

### Whether core can absorb the web session scanner as-is

**Decision:** No. Core must gain three capabilities before the scanner can
be deleted.

| Capability | core repositories | web `session-scanner.ts` |
| ---------- | ----------------- | ------------------------ |
| Claude Code sessions | yes | yes |
| `projectPath` filter | yes | yes |
| Cursor sessions | **no** (stub returns nothing) | yes |
| Worktree sessions (prefix + `~/.shep/repos/<sha256[0:16]>`) | **no** | yes (`includeWorktrees`) |
| `filePath` on the result | **no** (not on the TSP model) | yes |
| Batch by many paths | **no** | yes (`/api/sessions-batch`) |

Deleting the scanner before closing those gaps would silently drop Cursor
sessions and every worktree session from the canvas, and would remove the
`filePath` that gates the adopt action.

## Library Analysis

No new dependencies. Everything needed is already in the stack.

| Library | Version | Purpose | Pros | Cons |
| ------- | ------- | ------- | ---- | ---- |
| umzug | existing | Auto-discovered SQLite migrations for the two new Feature columns | Already the house pattern; migrations/ dir is globbed, no registry edit | None |
| better-sqlite3 | existing | Persistence | Already used | Native addon (see LESSONS.md) |
| node:fs | builtin | Subfolder enumeration behind the new port | No dependency added | Must stay in infrastructure |

## Security Considerations

- **Arbitrary path enumeration.** Discovery takes a caller-supplied absolute
  path and lists its children. The web route must keep the existing
  `path.isAbsolute` + `path.resolve` guards used by `/api/directory/list` so
  relative or traversal-style inputs cannot walk outside the intended root.
- **Transcript content reaches the model.** Adoption sends conversation text
  to an agent for summarisation. Transcripts routinely contain secrets,
  tokens, and customer data. The summarisation prompt must be truncated (as
  `MetadataGenerator` does with `MAX_INPUT_FOR_AI`) and the feature should
  not copy raw transcript content into the persisted feature description.
- **No new command interpolation.** The resume descriptor must be passed as
  argv (binary + args array), never assembled into a shell string — session
  ids come from filenames on disk. The existing PTY service already spawns
  with an args array.
- **Bulk import surface.** Importing many repos at once means many
  `AddRepositoryUseCase` calls; it performs no code execution, so the blast
  radius is DB rows only. No git operations run at import time.

## Performance Implications

- **Discovery is one readdir plus one stat per child.** Non-recursive by
  decision, so cost is bounded by the folder's fan-out. `withFileTypes`
  avoids a stat for the directory check itself.
- **Session scanning is the hot path.** `SessionsProvider` polls every 30s
  for every repo on the canvas. The core Claude repository already uses the
  right strategy (stat-all-in-parallel, then fully parse only the top-N by
  mtime) and the batch use case must preserve it — a naive implementation
  that parses every file for every repo on every poll would be markedly
  worse than what ships today. The scanner's 8KB `PREVIEW_READ_BYTES`
  head-read trick is worth carrying over for preview extraction.
- **Adoption costs one model call.** Bounded by prompt truncation, and only
  on explicit user action, not on poll. The deterministic fallback means a
  slow or failing model degrades quality, not availability.
- **Bulk import is N sequential DB writes.** Each `AddRepositoryUseCase`
  call does up to two lookups plus one insert. For a realistic folder
  (tens of repos) this is negligible; the per-path result array matters more
  than throughput.

## Open Questions

All questions resolved. The four from `spec.yaml` were answered before
research; research added no new blockers, but it did move one spec
assumption (`IAgentExecutorProvider` -> `IStructuredAgentCaller`) and
invalidate one implied approach (`CreateFeatureUseCase.execute()` with
`pending`).

---

_Updated by `/shep-kit:research` — proceed with `/shep-kit:plan`_
