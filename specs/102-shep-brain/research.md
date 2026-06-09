## Status

- **Phase:** Research
- **Updated:** 2026-06-09

## Technology Decisions

### Storage: SQLite `project_memory` table

Memory lives as one row per entry in the shared `~/.shep` SQLite DB, behind an
output port (`IProjectMemoryRepository`) with a mapper and an additive umzug
migration (`109-create-project-memory.ts`), exactly like `sdlc_subtasks` (mig
106). Rows are scoped by normalised `repositoryPath` and carry a `category`, a
stable `entryKey` for upsert, the `content`, optional `sourceFeatureId`, and
timestamps.

### Injection: `projectMemory` state channel

The feature-agent worker loads the repository's memory blob once via
`ReadProjectMemoryUseCase` and seeds an optional `projectMemory?: string` state
channel. The analyze and research prompt builders render it as a clearly
demarcated, read-only "PROJECT MEMORY" context section. Nodes never read a
global singleton for this (per LESSONS.md). Empty/absent memory degrades to no
section — zero behaviour change for fresh repos.

### Extraction: post-merge `extract_memory` node

A new terminal node is wired after `merge`: `merge --routeReexecution-->
extract_memory --> END` (today merge routes straight to END). It only does work
when the feature actually merged (guards on `state.commitHash`/merge outcome),
uses the injected `IAgentExecutor` to distil structured entries from the merged
diff + CI-fix history, and persists them via `RecordProjectMemoryUseCase`.
Failure to extract must never fail the feature (best-effort, logged).

## Library Analysis

| Library | Version | Purpose | Pros | Cons |
| ------- | ------- | ------- | ---- | ---- |
| better-sqlite3 | existing | Persist memory rows | Already the project DB; synchronous, fast | — |
| umzug | existing | Additive migration | Existing runner auto-discovers `NNN-*.ts` | — |
| @langchain/langgraph | existing | New extraction node | Existing graph + checkpointing | Must preserve resume semantics |
| TypeSpec | existing | `ProjectMemory` model + category enum | Single source of truth, codegen | Required fields ripple to fixtures |

## Security Considerations

Memory content is model-generated text persisted locally and re-injected into
prompts. Extraction prompts must instruct the agent to record only conventions/
decisions — never secrets, tokens, or credentials — and the record use case
should treat content as untrusted text (no eval/exec, length-capped per entry).

## Performance Implications

Read path adds one indexed SQLite query at feature start (negligible). The
injected blob is bounded by per-category caps to keep prompt size stable as the
store grows. Extraction is one extra agent call per merged feature, gated on a
successful merge only.

## Open Questions

All questions resolved.

---

_Updated by `/shep-kit:research` — proceed with `/shep-kit:plan`_
