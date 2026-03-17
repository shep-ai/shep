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
2. A repository node without a GitHub remote (and with valid git) shows a `CloudOff` badge icon with tooltip in its header.
3. Clicking the badge (or the node normally) opens the repository drawer.
4. The drawer shows a "Set Up GitHub Remote" section — always visible when `gitInfoStatus === 'ready' && hasRemote === false`.
5. User fills in the pre-populated form (name, visibility, optional org) and clicks "Init Remote".
6. On success: confirmation message with the new remote URL is shown for ~5 seconds, then hidden.
7. On error: inline error message below the button with actionable guidance.

---

## Data Layer

### `RepositoryNodeData` — new field

```typescript
hasRemote?: boolean   // undefined when gitInfoStatus !== 'ready'
```

Added to `RepositoryNodeData` in `repository-node-config.ts`.

Also added to `RepoGitInfo` in `get-graph-data.ts`:

```typescript
export interface RepoGitInfo {
  branch: string;
  commitMessage: string;
  committer: string;
  behindCount: number | null;
  hasRemote: boolean;  // NEW
}
```

Fetched via `git remote get-url origin`. A non-empty result → `true`; error or empty → `false`.

**SHA-gate bypass (critical):** `refreshRepoGitInfo()` has two early-return paths. The `hasRemote` check must be positioned correctly:

```
1. headSha = git rev-parse HEAD
2. if (!headSha) → cache as 'not-a-repo', return   [hasRemote irrelevant here]
3. hasRemote = git remote get-url origin (bool)     [NEW — fetch before SHA check]
4. if (cached.sha === headSha) → update cached.data.hasRemote, return  [short-circuit, but refresh hasRemote]
5. ... full refresh (branch, commit, committer, behindCount, hasRemote)
```

`hasRemote` is fetched after confirming the directory is a valid git repo (step 2), but before the SHA equality check (step 4), so it is always fresh regardless of whether HEAD has changed.

**`not-a-repo` handling:** When `gitInfoStatus === 'not-a-repo'`, `RepoGitInfo` has no data payload and `hasRemote` is absent from `RepositoryNodeData` (field is `undefined`). The "Set Up GitHub Remote" section is only shown when `gitInfoStatus === 'ready' && hasRemote === false`. It is never shown for `not-a-repo` or `loading` repos.

**Virtual repo nodes:** Virtual (orphan-grouping) nodes have no real repository path and must set `hasRemote: true` to suppress the form. This applies to both `build-graph-nodes.ts` and `derive-graph.ts` — both create virtual nodes and both must default `hasRemote: true`.

### `repoGitInfoMap` pipeline

`get-graph-data.ts` already builds a `repoGitInfoMap: Map<string, RepoGitInfo>` and passes it to `buildGraphNodes`. Since `hasRemote` is added to `RepoGitInfo`, it flows through the same existing Map — no third Map needed.

**`BuildGraphNodesOptions` type update (required):** The `repoGitInfo` field in `BuildGraphNodesOptions` (in `build-graph-nodes.ts`) is typed as an inline object literal `{ branch: string; commitMessage: string; ... }`, not as `Map<string, RepoGitInfo>`. Simply adding `hasRemote` to `RepoGitInfo` will not make it visible to `build-graph-nodes.ts`. The inline type must be updated to include `hasRemote: boolean`, or replaced with `Map<string, RepoGitInfo>` (imported from `get-graph-data.ts`).

### Cache invalidation

`get-graph-data.ts` exports `invalidateRepoGitCache(repoPath: string)` — deletes the entry for that path from the in-memory `gitInfoCache` Map.

The server action calls this before `revalidatePath('/', 'layout')`. Rationale: `hasRemote` lives in the git info cache (TTL = 30s), not tracked by SSE events. Without `invalidateRepoGitCache`, the stale `hasRemote: false` would persist in server-rendered props for up to 30 seconds after a successful init. `revalidatePath` forces the next RSC render to call `get-graph-data.ts` with a cleared cache entry, fetching `hasRemote: true` immediately.

### New server action: `initRemoteRepository`

**Location:** `src/presentation/web/app/actions/init-remote-repository.ts`

**Input:**
```typescript
{
  repositoryId: string   // maps to RepositoryNodeData.id
  name: string
  isPrivate: boolean
  org?: string
}
```

**Output:**
```typescript
{ repoUrl: string } | { error: string }
```

**`repositoryId` → `cwd` resolution:** Calls `IRepositoryRepository.findById(repositoryId)` to obtain the `Repository` entity and its `path` field. Same pattern as `approve-feature.ts` using `featureRepo.findById`. If `findById` returns `null`, returns `{ error: 'Repository not found.' }` immediately.

**`isPrivate` → `isPublic` inversion:** `InitRemoteRepositoryUseCase` input uses `isPublic?: boolean`. The server action passes `isPublic: !isPrivate`.

**Error discrimination** — by `GitPrErrorCode`, not message substring matching:

| `GitPrErrorCode` | User-facing message |
|-----------------|---------------------|
| `GH_NOT_FOUND` | `"gh CLI not found. Install with: brew install gh"` |
| `AUTH_FAILURE` | `"gh CLI not authenticated. Run: gh auth login"` |
| `REMOTE_ALREADY_EXISTS` | `"This repository already has a remote configured."` |
| anything else | raw `error.message` |

`GH_NOT_FOUND` and `REMOTE_ALREADY_EXISTS` are thrown explicitly by `InitRemoteRepositoryUseCase`. `AUTH_FAILURE` propagates from `createGitHubRepo()` per `IGitPrService` JSDoc (`@throws GitPrError with AUTH_FAILURE code if gh is not authenticated`).

**On success:**
1. `invalidateRepoGitCache(repository.path)`
2. `revalidatePath('/', 'layout')`
3. Return `{ repoUrl }`

---

## UI Components

### Repository Node — "No Remote" Badge

**Location:** `src/presentation/web/components/common/repository-node/repository-node.tsx`

- Conditional render: when `gitInfoStatus === 'ready' && hasRemote === false`, show `CloudOff` (lucide-react) in the node header alongside existing action buttons.
- Wrapped in a `Tooltip` with content `"Set up GitHub remote"` — consistent with the `TooltipProvider`/`Tooltip` pattern on all other action buttons.
- Clicking navigates to the repository drawer via existing URL-based routing.
- Disappears when `hasRemote` becomes `true` after graph refresh.

### Repository Drawer — "Set Up GitHub Remote" Section

Two drawer components exist:

- `components/common/repository-node/repository-drawer.tsx` — standalone, used by Storybook
- `components/common/control-center-drawer/repository-drawer-client.tsx` — App Router parallel routes

Both render the section. Form logic lives in a new shared sub-component `InitRemoteSection`.

#### Shared sub-component: `InitRemoteSection`

**Location:** `components/common/repository-node/init-remote-section.tsx`

```typescript
interface InitRemoteSectionProps {
  repositoryId: string           // from RepositoryNodeData.id
  repositoryPath: string         // from RepositoryNodeData.repositoryPath (non-optional at call site)
  _initialErrorMessage?: string  // test-only: seeds error state for Storybook stories
}
```

`RepositoryNodeData.repositoryPath` is typed as `string | undefined`. The parent drawer's render condition must therefore guard for its presence:

```typescript
data.gitInfoStatus === 'ready' && data.hasRemote === false && !!data.repositoryPath
```

Only when all three are true is `<InitRemoteSection repositoryId={data.id!} repositoryPath={data.repositoryPath} ...>` safe to call with a `string` (not `string | undefined`).

#### Form fields

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Repo name | Text input | `basename(repositoryPath.replace(/\\/g, '/'))` | Required. Forward-slash normalized for Windows cross-platform consistency. |
| Visibility | Radio toggle | Private | Private / Public |
| Org | Text input | Empty | Optional; placeholder "GitHub org (optional)" |

#### States

- **Idle:** Form fields and button enabled.
- **In-flight:** Button shows spinner, fields disabled, button text "Initialising…".
- **Success:** Section replaced with `Remote configured: {repoUrl.replace('https://', '')}`. Held in local `successUrl` state. A `setTimeout` of 5000ms clears it, cancelled via `useEffect` cleanup on unmount.
- **Error:** Inline error below button. Discriminated by `GitPrErrorCode`. Auto-clears after 5s (consistent with `useRepositoryActions` pattern). Seeded in Storybook via `_initialErrorMessage` prop.

---

## Storybook

**New mock:** `.storybook/mocks/app/actions/init-remote-repository.ts`

```typescript
export const initRemoteRepository = async () => ({ repoUrl: 'https://github.com/example/repo' })
```

**Error-state stories:** `InitRemoteSection` accepts `_initialErrorMessage?: string` (test-only prop). Stories pass a pre-set error string directly — no `@storybook/test` play functions needed (consistent with project pattern of avoiding `@storybook/test` imports in story files).

**Stories to add:**

| Story | What it covers |
|-------|---------------|
| `RepositoryDrawer.HasNoRemote` | Form visible, idle state |
| `RepositoryDrawer.HasRemote` | Form absent |
| `RepositoryDrawer.InitRemoteLoading` | Form in-flight (disable fields + spinner) |
| `RepositoryDrawer.InitRemoteSuccess` | `successUrl` set, confirmation visible |
| `RepositoryDrawer.InitRemoteError` | Error message via `_initialErrorMessage` |

---

## Affected Files

| File | Change |
|------|--------|
| `components/common/repository-node/repository-node-config.ts` | Add `hasRemote?: boolean` to `RepositoryNodeData` |
| `app/(dashboard)/get-graph-data.ts` | Add `hasRemote: boolean` to `RepoGitInfo`; fetch after headSha check, before SHA equality check; update short-circuit path; export `invalidateRepoGitCache(repoPath)` |
| `app/build-graph-nodes.ts` | Update `BuildGraphNodesOptions.repoGitInfo` inline type to include `hasRemote: boolean`; pass `hasRemote` into real node data; virtual nodes default to `hasRemote: true` |
| `lib/derive-graph.ts` | Pass `hasRemote` into `RepositoryNodeData` for real live canvas nodes; virtual nodes default to `hasRemote: true` |
| `components/common/repository-node/repository-node.tsx` | Render `CloudOff` badge with tooltip when `gitInfoStatus === 'ready' && hasRemote === false` |
| `components/common/repository-node/init-remote-section.tsx` | New shared sub-component with form, submission, success/error states |
| `components/common/repository-node/repository-drawer.tsx` | Render `InitRemoteSection` when `data.gitInfoStatus === 'ready' && data.hasRemote === false` |
| `components/common/control-center-drawer/repository-drawer-client.tsx` | Render `InitRemoteSection` when condition met |
| `app/actions/init-remote-repository.ts` | New server action (findById lookup, isPublic inversion, GitPrErrorCode discrimination, cache invalidation) |
| `.storybook/mocks/app/actions/init-remote-repository.ts` | New Storybook mock |
| `components/common/repository-node/repository-drawer.stories.tsx` | 5 new story variants |

---

## Out of Scope

- No new API routes.
- No feature flag.
- No changes to CLI command or domain layer (already implemented).

---

## Success Criteria

- [ ] `hasRemote?: boolean` added to `RepositoryNodeData` in `repository-node-config.ts`
- [ ] `hasRemote: boolean` added to `RepoGitInfo` in `get-graph-data.ts`
- [ ] `hasRemote` fetched after `headSha` null-check, before SHA equality check
- [ ] SHA short-circuit path updates `cached.data.hasRemote` with fresh value
- [ ] `invalidateRepoGitCache(repoPath)` exported from `get-graph-data.ts`
- [ ] `BuildGraphNodesOptions.repoGitInfo` inline type updated to include `hasRemote: boolean`
- [ ] `hasRemote` flows through `repoGitInfoMap` → `build-graph-nodes.ts` and `derive-graph.ts`
- [ ] Virtual repo nodes in both `build-graph-nodes.ts` and `derive-graph.ts` set `hasRemote: true`
- [ ] `CloudOff` badge with tooltip shown when `gitInfoStatus === 'ready' && hasRemote === false`
- [ ] Badge absent otherwise
- [ ] `InitRemoteSection` is a standalone component with `_initialErrorMessage` test-only prop
- [ ] Both `repository-drawer.tsx` and `repository-drawer-client.tsx` render `InitRemoteSection` with condition `gitInfoStatus === 'ready' && hasRemote === false && !!repositoryPath`
- [ ] Repo name pre-filled with `basename(repositoryPath.replace(/\\/g, '/'))`
- [ ] Visibility defaults to Private; `isPrivate: true` → `isPublic: false` in server action
- [ ] Org field optional
- [ ] Server action resolves `repositoryId` → `Repository` via `IRepositoryRepository.findById`; returns error if null
- [ ] Error discrimination via `GitPrErrorCode` (GH_NOT_FOUND, AUTH_FAILURE, REMOTE_ALREADY_EXISTS, generic)
- [ ] In-flight: fields disabled, spinner visible
- [ ] Success: shows `repoUrl.replace('https://', '')` for 5s; `useEffect` cleanup cancels timer
- [ ] Error: shows actionable message; auto-clears after 5s
- [ ] `invalidateRepoGitCache` + `revalidatePath` called on success
- [ ] `.storybook/mocks/app/actions/init-remote-repository.ts` created
- [ ] 5 drawer story variants added covering all states
