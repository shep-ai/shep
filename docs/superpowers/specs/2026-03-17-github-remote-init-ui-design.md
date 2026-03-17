# GitHub Remote Init — Web UI Design

**Date:** 2026-03-17
**Feature branch:** `feat/github-remote-init`
**Related spec:** `specs/069-github-remote-init/`

---

## Overview

The existing `shep repo init-remote` CLI command creates a GitHub repository and configures the local `origin` remote for repos that have none. This design adds a web UI surface for the same operation: a visual indicator on the repository node and an inline form in the repository drawer.

---

## User Flow

1. User opens the Control Center (canvas).
2. A repository node without a GitHub remote shows a subtle "no remote" badge icon in its header.
3. Clicking the badge (or the node normally) opens the repository drawer.
4. The drawer shows a "Set Up GitHub Remote" section — always visible when `hasRemote === false`.
5. User fills in the pre-populated form (name, visibility, optional org) and clicks "Init Remote".
6. On success: confirmation message with the new remote URL is shown; the section disappears on next graph refresh.
7. On error: inline error message below the button with actionable guidance.

---

## Data Layer

### `RepositoryNodeData` — new field

```typescript
hasRemote: boolean
```

Fetched in `get-graph-data.ts` alongside existing git info (branch, commit, committer, behindCount). Uses the already-implemented `IGitPrService.hasRemote(cwd)`. Cached on the same 30-second TTL as all other git info. No new subprocess patterns introduced.

### New server action: `initRemoteRepository`

**Location:** `src/presentation/web/app/actions/init-remote-repository.ts`

**Input:**
```typescript
{
  repositoryId: string
  name: string          // GitHub repo name
  isPrivate: boolean    // true = private, false = public
  org?: string          // optional GitHub org
}
```

**Output:**
```typescript
{ repoUrl: string } | { error: string }
```

On success, invalidates the graph data cache so `hasRemote` re-evaluates on next fetch and the indicator + form disappear automatically.

Delegates to `InitRemoteRepositoryUseCase` (already implemented in the domain layer).

---

## UI Components

### Repository Node — "No Remote" Badge

**Location:** `src/presentation/web/components/common/repository-node/repository-node.tsx`

- Conditional render: when `hasRemote === false`, show a small cloud-off icon (e.g. `CloudOff` from lucide-react) in the node header alongside existing action buttons (IDE, Shell, Folder).
- Clicking the icon navigates to the repository drawer via the existing URL-based routing (same as clicking the node).
- Badge disappears once `hasRemote === true` after graph refresh.
- No tooltip required; the drawer provides context.

### Repository Drawer — "Set Up GitHub Remote" Section

**Location:** `src/presentation/web/components/common/control-center-drawer/repository-drawer-client.tsx`

Rendered **only when `hasRemote === false`**, below the existing "OPEN WITH" section.

#### Form fields

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Repo name | Text input | Directory name derived from `repositoryPath` | Required |
| Visibility | Radio toggle | Private | Private / Public |
| Org | Text input | Empty | Optional; placeholder "GitHub org (optional)" |

#### States

- **Idle:** Form fields enabled, "Init Remote" button enabled.
- **In-flight:** Button shows spinner, fields disabled, button text "Initialising…".
- **Success:** Section replaced with confirmation: `Remote configured: github.com/<org-or-user>/<name>`. Disappears on next graph data refresh when `hasRemote` flips to `true`.
- **Error:** Inline error message below the button. Error messages are actionable:
  - gh not installed → "gh CLI not found. Install with: `brew install gh`"
  - gh not authenticated → "gh CLI not authenticated. Run: `gh auth login`"
  - Remote already exists → "This repository already has a remote configured."
  - Generic → raw error message from use case.

#### Form state management

Local React state (`useState`) within the drawer component. No global state changes needed — success triggers a graph data refresh via cache invalidation in the server action.

---

## Affected Files

| File | Change |
|------|--------|
| `app/(dashboard)/get-graph-data.ts` | Call `hasRemote(cwd)` per repo, add to git info result |
| `app/build-graph-nodes.ts` | Pass `hasRemote` into `RepositoryNodeData` |
| `components/common/repository-node/repository-node.tsx` | Render `CloudOff` badge when `hasRemote === false` |
| `components/common/control-center-drawer/repository-drawer-client.tsx` | Add "Set Up GitHub Remote" section with form |
| `app/actions/init-remote-repository.ts` | New server action delegating to `InitRemoteRepositoryUseCase` |

---

## Out of Scope

- No new API routes (uses Next.js server actions, consistent with all other repo operations).
- No feature flag (the section is simply absent when `hasRemote === true`).
- No Storybook stories deferred — stories for new drawer section will be included per CLAUDE.md requirement.
- No changes to the CLI command or domain layer (already implemented).

---

## Success Criteria

- [ ] `hasRemote` present in `RepositoryNodeData` and correctly populated from `get-graph-data.ts`
- [ ] Repository node shows `CloudOff` badge when `hasRemote === false`
- [ ] Badge absent when `hasRemote === true`
- [ ] Repository drawer shows "Set Up GitHub Remote" section when `hasRemote === false`
- [ ] Section absent when `hasRemote === true`
- [ ] Repo name pre-filled with directory name
- [ ] Visibility defaults to Private
- [ ] Org field is optional
- [ ] Button shows loading state during action
- [ ] Success state shows remote URL, section disappears on next refresh
- [ ] Error states show actionable messages
- [ ] `initRemoteRepository` server action delegates to `InitRemoteRepositoryUseCase`
- [ ] Graph cache invalidated on success so `hasRemote` re-evaluates
- [ ] Storybook stories for updated drawer section
