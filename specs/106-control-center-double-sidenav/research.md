## Status

- **Phase:** Research
- **Updated:** 2026-08-04

## Summary

Three findings shaped the plan.

1. **No new repository method is needed.** The spec assumed a
   `findBySourceAgentSessionId` lookup. But the tree already lists every
   feature to build its middle level, so the adopted-session map can be built
   from that same list in memory. This removes a planned port change.

2. **`delete` must be optional on the session port.** Making it required
   would force `StubSessionRepository` — and every future provider — to
   implement a destructive operation. An optional method plus a capability
   check mirrors how `isSupported()` already gates listing.

3. **A second `SidebarProvider` cannot be nested.** It owns a single
   open/closed state and one cookie; two providers would fight over it. The
   second panel renders as a sibling inside the existing provider with its own
   local open state.

## Technology Decisions

### Where the tree is assembled

**Decision:** a new `BuildSessionTreeUseCase` returning a ready-to-render
view model.

**Rationale:** the tree joins repositories, features, and sessions, and
applies a domain rule (a session is adopted iff some feature's
`sourceAgentSessionId` equals its id). Both belong in the application layer
per the project's "logic lives in core, not presentation" rule. Composing
`ListSessionsForPathsUseCase` rather than extending it preserves that use
case's 30-second cache on the canvas polling path.

### How adopted sessions are identified

**Decision:** build a `Map<sessionId, {featureId, featureName}>` while walking
the feature list the tree already needs.

**Rationale:** the data is already in memory. A per-session repository lookup
would issue N queries for it. This also means the spec's planned
`IFeatureRepository.findBySourceAgentSessionId` is unnecessary.

### Where session archive state lives

**Decision:** an `archived_agent_sessions` marker table, one row per archived
session, keyed by `(agent_type, session_id)`. Unarchive deletes the row.

**Rationale:** `AgentSession` is explicitly not a shep database row.
Materialising every discovered session to support an archive flag would
invert that invariant and introduce a sync problem. Archived sessions are
sparse, so storing only them is both smaller and truthful. Row-delete
unarchive makes reversibility trivial. Provider files are never touched, which
is the guarantee that distinguishes archive from delete.

### How transcript deletion reaches the providers

**Decision:** `delete?(id): Promise<boolean>` on `IAgentSessionRepository`,
with the use case probing for its presence.

**Rationale:** deletion is provider-specific — Claude Code and Codex unlink a
single `.jsonl`, while Cursor may need to remove a whole
directory-per-transcript folder. That layout knowledge already lives in each
repository, so deletion belongs there rather than in a separate port. Keeping
the method optional avoids forcing a destructive implementation onto the stub
and unsupported providers.

### Double sidenav composition

**Decision:** a second `Sidebar` rendered as a sibling within the existing
`SidebarProvider`, gated on `pathname`, with the tree panel defaulting to
open.

**Rationale:** one provider, one rail state, no cookie contention. Reusing the
sidebar primitive inherits its mobile sheet, RTL, and keyboard handling.
`app-shell` already reads `pathname`, so scoping the panel to the Control
Center is a conditional render.

### Reusing ui/file-tree.tsx

**Decision:** borrow the Radix accordion pattern, not the component.

**Rationale:** `TreeViewElement` is `{id, name, type: 'file' | 'folder',
children}` — a filesystem model. Session nodes need agent type, adopted state,
message count, relative time, and per-node actions. Adapting them into a
file/folder element would mean encoding domain state in strings.

## Library Analysis

No new dependencies. The 21st.dev reference depends on `@carbon/icons-react`;
this project uses `lucide-react` and will not add a second icon set.

| Library | Version | Purpose | Pros | Cons |
| ------- | ------- | ------- | ---- | ---- |
| shadcn/ui sidebar | existing | Second panel + icon rail | Already supports `collapsible="icon"`, mobile, RTL | Single provider state — cannot nest |
| Radix Accordion | existing | Expand/collapse tree levels | Already used by `ui/file-tree.tsx`; accessible | — |
| lucide-react | existing | Icons | Already the project's icon set | — |
| umzug | existing | Migration for the marker table | House pattern, auto-discovered | — |

## Security Considerations

- **Deletion is irreversible and touches files shep does not own.** It must be
  gated behind explicit confirmation naming the file, must never be the
  default action, and must never run implicitly as part of archiving.
- **Path containment.** A session id resolves to a transcript path derived from
  provider encodings. Deletion must verify the resolved path sits inside the
  expected provider root before unlinking, so a malformed or crafted id cannot
  escape into arbitrary filesystem locations.
- **Deleting a transcript must not cascade.** An adopted session's feature is
  independent data; removing the transcript may leave
  `Feature.sourceAgentSessionId` dangling, which is acceptable and must not
  delete or block the feature.
- **Archive is safe by construction** — it only inserts a shep-side row.

## Performance Implications

- **The tree composes a cached source.** `ListSessionsForPathsUseCase` already
  caches for 30s and parses only the top-N transcripts per path, so tree
  builds stay cheap. The archived-id set is one indexed table read.
- **Tree size is bounded by repo count.** With 20+ repositories the panel
  should render session children per expanded node rather than eagerly
  rendering every session for every repo.
- **Archive/unarchive are single-row writes**, and deletion is one filesystem
  unlink — neither is on a polling path.

## Open Questions

All resolved. Research removed one planned change (no new `IFeatureRepository`
method) and hardened two decisions (optional `delete` on the port; no nested
`SidebarProvider`).

---

_Updated by `/shep-kit:research` — proceed with `/shep-kit:plan`_
