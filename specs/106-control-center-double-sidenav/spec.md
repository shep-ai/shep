## Problem Statement

Spec 105 made in-flight Claude Code / Cursor sessions actionable — they can
be adopted into features, resumed in a terminal, or opened in an IDE. But it
left three gaps.

**Sessions are only reachable one repository at a time.** The only entry
point is `FeatureSessionsDropdown`, which hangs off a single repository node
on the canvas and shows that node's sessions. A user with 22 imported
repositories has no way to survey their in-flight work as a whole, which is
precisely what "browse for maximum capability" asks for.

**Adopted and unadopted sessions look identical.** `Feature.sourceAgentSessionId`
is persisted at adoption time, so the data exists — but nothing queries it.
The dropdown renders every session the same way, so a user cannot tell which
conversations they have already converted and which are still loose. That
makes the list actively misleading over time: adopting a session does not
visibly change anything about it.

**Sessions accumulate forever.** `IAgentSessionRepository` is read-only
(`list`, `findById`, `isSupported`). There is no archive and no delete. Every
transcript the user has ever created stays in the list at equal weight, and
the only remedy is to leave shep and delete JSONL files by hand.

The Control Center also has a single sidebar today. `app-shell.tsx` renders
`SidebarProvider` + `AppSidebar` + `SidebarInset`, and `AppSidebar` is a
513-line navigation menu. There is no second panel to put a tree in.

## Success Criteria

- [ ] The Control Center renders two sidenavs: the existing AppSidebar
      collapsed to a narrow icon rail, and a tree panel beside it that is
      open by default.
- [ ] The tree panel is scoped to the Control Center — other app-shell routes
      are visually unchanged.
- [ ] The tree renders Repository → features → sessions, with adopted
      sessions nested under the feature they became and unadopted sessions in
      a separate per-repository bucket.
- [ ] Adopted and unadopted sessions are visually distinguishable without
      hovering or opening anything.
- [ ] The adopted/unadopted determination comes from
      `Feature.sourceAgentSessionId` via a use case — never from a
      presentation-layer guess.
- [ ] A session can be archived in one click. Archiving hides it from the
      tree, is reversible, and never modifies any provider file.
- [ ] Archived sessions can be revealed and un-archived.
- [ ] A session can be deleted, but only through an explicit confirmation
      that states the transcript file will be removed from disk.
- [ ] Delete works for Claude Code, Codex CLI, and Cursor transcripts,
      including Cursor's directory-per-transcript layout.
- [ ] Deleting or archiving a session that has been adopted does not delete
      or damage the feature derived from it.
- [ ] The tree consumes the existing `ListSessionsForPathsUseCase` rather
      than re-scanning provider directories.
- [ ] New and changed web components have colocated Storybook stories, and
      every new i18n key exists in all nine locales.

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `presentation/web/components/layouts/app-shell/` | High | Must host a second sidebar and collapse the first to an icon rail, without changing non-Control-Center routes. |
| `presentation/web/components/layouts/app-sidebar/` | Medium | Needs to render correctly as an icon rail; currently 513 lines, so it is a refactor-before-extending candidate. |
| New `presentation/web/components/features/session-tree/` | High | The tree panel, its nodes, badges, and action menus, plus stories. |
| `application/ports/output/agents/agent-session-repository.interface.ts` | High | Read-only today; gains a delete capability that every provider must implement. |
| `infrastructure/services/agents/sessions/` | High | Per-provider transcript deletion — Claude Code and Codex JSONL files, Cursor's flat and nested layouts. |
| New archive persistence | High | `AgentSession` is explicitly not a shep DB row, so archive state needs its own storage plus a migration. |
| `application/ports/output/repositories/feature-repository.interface.ts` | Medium | No lookup by source session exists; the tree needs adopted-session ids in bulk. |
| New `application/use-cases/agents/` use cases | High | Build the tree, archive/unarchive, delete — all behind use cases. |
| `tsp/` | Medium | Archive state and any tree view-model shapes are TypeSpec-first. |
| `translations/*/web.json` | Low | Nine locales, or the completeness test fails. |

## Dependencies

**Hard dependency on `105-import-codebases-adopt-sessions`**, which is not
yet merged. This feature branches from `feat/105-import-codebases-adopt-sessions`
rather than `main` because it builds directly on:

- `Feature.sourceAgentSessionId` / `sourceAgentType` — the adopted/unadopted
  distinction is impossible without them.
- `ListSessionsForPathsUseCase` — the tree's data source.
- `CursorSessionRepository` — Cursor sessions must be deletable, which
  requires them to be discoverable first.
- `AgentSession.filePath` — deletion needs to know which file to unlink.

Spec 105 must merge before this one.

## Size Estimate

**L** — The UI is the visible half but the smaller one: a second sidebar, a
tree, and badges over an existing data source. The larger half is that
sessions become mutable for the first time. That means a new port capability
with three provider implementations, new persistence for archive state on
entities that deliberately have no database rows, a TypeSpec model plus
migration, and a destructive path that has to be safe — deleting a
transcript must never damage the feature adopted from it. Not XL because no
agent orchestration, no new external integration, and the tree's data already
arrives shaped by spec 105.

---

_Generated by `/shep-kit:new-feature` — proceed with `/shep-kit:research`_
