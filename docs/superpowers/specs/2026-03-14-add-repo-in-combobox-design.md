# Add New Repository Option in RepositoryCombobox

## Problem

When a user opens the feature create drawer from the sidebar (no repository context), they can only select from existing tracked repositories. If they have zero repositories, the sidebar button is disabled entirely with a tooltip "Add a repository first" — a dead end that forces them to navigate elsewhere to add a repo before they can create a feature.

## Solution

Add an "Add new repository..." action item pinned at the bottom of the `RepositoryCombobox` dropdown. This item opens the native OS folder picker, adds the selected folder as a tracked repository, and auto-selects it. The sidebar "New feature" button is always enabled, and the combobox is shown even with zero repos.

## Design

### 1. RepositoryCombobox Changes

**Note:** `RepositoryCombobox` is co-located inside `feature-create-drawer.tsx` (line 1076), not a separate file. All combobox changes happen in that same file.

**New prop:**

```typescript
export interface RepositoryComboboxProps {
  repositories: RepositoryOption[];
  value: string | undefined;
  onChange: (path: string | undefined) => void;
  onAddRepository?: (repo: RepositoryOption) => void;
  disabled?: boolean;
}
```

`onAddRepository` is called after a new repository is successfully added. The parent component uses this to append the new repo to its list and auto-select it.

**Dropdown layout:**

The "Add new repository..." item is placed **outside** the scrollable `max-h-48` list area, below a `Separator`, so it is always visible regardless of scroll position.

```
┌──────────────────────────────┐
│ Search repositories...       │  ← border-b search area
├──────────────────────────────┤
│ ✓ my-app                     │  ← scrollable max-h-48 area
│   /Users/me/code/my-app      │
│                              │
│   other-project              │
│   /Users/me/code/other       │
├──────────────────────────────┤  ← Separator (outside scroll)
│ + Add new repository...      │  ← pinned, always visible
└──────────────────────────────┘
```

When zero repos exist:

```
┌──────────────────────────────┐
│ Search repositories...       │
├──────────────────────────────┤
│ No repositories found.       │
├──────────────────────────────┤
│ + Add new repository...      │
└──────────────────────────────┘
```

**Click flow:**

1. User clicks "Add new repository..."
2. `pickFolder()` opens native OS folder dialog
3. If user selects a folder: `addRepository({ path })` server action is called
4. Server action returns `{ repository?: Repository }` — map to `RepositoryOption`: `{ id: repo.id, name: repo.name, path: repo.path }`
5. `onAddRepository(mappedRepo)` callback fires
6. Parent updates its `repositories` state and sets `selectedRepoPath` to the new repo's path
7. Popover closes with the new repo selected
8. If user cancels the folder dialog: nothing happens, popover stays open

**Architectural note:** The existing `AddRepositoryButton` uses `pickFolder()` + custom event dispatching (`shep:add-repository`) for the canvas flow. The combobox calls `addRepository` server action directly because it needs the `Repository` result (with `id` and `name`) to immediately populate the combobox selection. The canvas flow uses events because it needs to trigger a full page revalidation. Both are valid patterns for their contexts.

**Loading state:** While the folder picker is open / add-repository action is running, the "Add new repository..." item shows a spinner and is non-interactive.

### 2. FeatureCreateDrawer Changes

**`showRepoSelector` condition change:**

```typescript
// Before
const showRepoSelector = !repositoryPath && repositories && repositories.length > 0;

// After
const showRepoSelector = !repositoryPath && repositories !== undefined;
```

This ensures the combobox appears even with zero tracked repos. The existing `needsRepo` variable (`!repositoryPath && !selectedRepoPath`) correctly keeps the submit button disabled until a repo is selected — no change needed there.

**New state for managing dynamically added repos:**

```typescript
const [localRepos, setLocalRepos] = useState<RepositoryOption[]>(repositories ?? []);
```

Sync with `repositories` prop via `useEffect` when it changes. When `onAddRepository` fires, append the new repo to `localRepos` and set `selectedRepoPath`.

**Wire up the callback:**

```tsx
<RepositoryCombobox
  repositories={localRepos}
  value={selectedRepoPath}
  onChange={setSelectedRepoPath}
  onAddRepository={(repo) => {
    setLocalRepos((prev) => [...prev, repo]);
    setSelectedRepoPath(repo.path);
  }}
  disabled={isSubmitting}
/>
```

### 3. AppSidebar Changes

Remove the `hasRepositories` conditional that disables the "New feature" button. The button is always enabled because the drawer now handles the zero-repos case inline.

```typescript
// Before: conditional disabled state based on hasRepositories
// After: always enabled
<SidebarMenuButton onClick={onNewFeature} tooltip="New feature">
  <Plus />
  <span>New feature</span>
</SidebarMenuButton>
```

Remove the `hasRepositories` prop from `AppSidebarProps`. Update `app-shell.tsx` to stop passing it. The `sidebar-repository-count-context` can be removed entirely if `hasRepositories` was its only consumer — verify during implementation and clean up if so.

### 4. Files Changed

| File                                             | Change                                                                                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature-create-drawer.tsx`                      | Add `onAddRepository` prop to `RepositoryCombobox`, add "Add new repository..." pinned item with folder picker + `addRepository` server action, update `showRepoSelector` condition, add `localRepos` state |
| `app-sidebar.tsx`                                | Remove `hasRepositories` prop and conditional, always enable "New feature" button                                                                                                                           |
| `app-shell.tsx`                                  | Stop passing `hasRepositories` prop                                                                                                                                                                         |
| `sidebar-repository-count-context.tsx`           | Remove if no longer consumed; keep if used elsewhere                                                                                                                                                        |
| `repository-combobox.stories.tsx`                | Add stories for "Add new repository" action, zero-repos state                                                                                                                                               |
| `feature-create-drawer.stories.tsx`              | Update stories for zero-repos-with-add-option                                                                                                                                                               |
| `app-sidebar.stories.tsx`                        | Remove `hasRepositories` stories                                                                                                                                                                            |
| `.storybook/mocks/app/actions/add-repository.ts` | Verify mock returns correct shape `{ repository: { id, name, path } }`                                                                                                                                      |
| `.storybook/mocks/` (pick-folder)                | Verify `pickFolder` mock exists and is resolvable from the import path used                                                                                                                                 |
| Tests                                            | Add/update tests for new combobox behavior, add-repo flow                                                                                                                                                   |

### 5. Imports Needed in RepositoryCombobox

- `pickFolder` from `@/components/common/add-repository-button/pick-folder` (reuse existing wrapper that calls the server action)
- `addRepository` from `@/app/actions/add-repository` (reuse existing server action)
- `FolderPlus` and `Loader2` icons from `lucide-react`
- `Separator` from `@/components/ui/separator` (for the divider)

### 6. Error Handling

- If `addRepository` returns `{ error }`, show the error inline as red text below the "Add new repository" item, keep popover open
- If `pickFolder` throws, catch and show error similarly
- Errors clear when the user clicks "Add new repository..." again or selects any repository option

### 7. Testing Plan

**Unit tests:**

- RepositoryCombobox renders "Add new repository..." item
- Clicking "Add new repository..." triggers folder picker flow
- After successful add, `onAddRepository` callback is called with correct `RepositoryOption`
- Zero repos state shows the add option
- Error state displays inline error message

**Stories:**

- `WithAddRepository` — combobox with repos and the add action
- `ZeroReposWithAdd` — empty list with just the add action
- `AddRepositoryLoading` — spinner state during add

## Non-Goals

- No changes to the canvas repository node or its (+) button flow
- No changes to the control-center-empty-state component
- No drag-and-drop folder support in the combobox
- No cross-platform path name extraction — the server's `addRepository` use case handles name derivation
