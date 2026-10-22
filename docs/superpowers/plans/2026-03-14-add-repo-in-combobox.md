# Add New Repository in Combobox — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Add new repository..." action inside the RepositoryCombobox dropdown so users can add repos inline when creating a feature, including from the zero-repos state.

**Architecture:** Extend the existing `RepositoryCombobox` (inside `feature-create-drawer.tsx`) with a pinned footer item that calls `pickFolder()` + `addRepository()` server action. Update `FeatureCreateDrawer` to show the combobox even with zero repos. Remove the disabled gating on the sidebar "New feature" button.

**Tech Stack:** React, Next.js server actions, Vitest, Storybook, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-03-14-add-repo-in-combobox-design.md`

---

## File Structure

| File                                                                                                 | Action | Responsibility                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/presentation/web/components/common/feature-create-drawer/feature-create-drawer.tsx`             | Modify | Add `onAddRepository` prop + "Add new repository..." item to `RepositoryCombobox`; update `showRepoSelector` condition; add `localRepos` state to `FeatureCreateDrawer` |
| `src/presentation/web/components/layouts/app-sidebar/app-sidebar.tsx`                                | Modify | Remove `hasRepositories` prop and disabled button gating                                                                                                                |
| `src/presentation/web/components/layouts/app-shell/app-shell.tsx`                                    | Modify | Remove `hasRepositories` prop passing and `sidebar-repository-count-context` usage                                                                                      |
| `src/presentation/web/hooks/sidebar-repository-count-context.tsx`                                    | Delete | No longer consumed after sidebar changes                                                                                                                                |
| `src/presentation/web/components/features/control-center/control-center-inner.tsx`                   | Modify | Remove `useSidebarRepositoryCount` import and usage                                                                                                                     |
| `tests/unit/presentation/web/components/common/feature-create-drawer/feature-create-drawer.test.tsx` | Modify | Add tests for "Add new repository" flow; update zero-repos test                                                                                                         |
| `src/presentation/web/components/common/feature-create-drawer/repository-combobox.stories.tsx`       | Modify | Add stories for add-repo action and zero-repos state                                                                                                                    |
| `src/presentation/web/components/common/feature-create-drawer/feature-create-drawer.stories.tsx`     | Modify | Update `WithRepoSelectorEmpty` story                                                                                                                                    |
| `src/presentation/web/components/layouts/app-sidebar/app-sidebar.stories.tsx`                        | Modify | Remove `DisabledNoRepos` story                                                                                                                                          |

---

## Chunk 1: RepositoryCombobox — Add "Add new repository..." item

### Task 1: Write failing tests for "Add new repository" in combobox

**Files:**

- Modify: `tests/unit/presentation/web/components/common/feature-create-drawer/feature-create-drawer.test.tsx`

- [ ] **Step 1: Add mocks for pickFolder and addRepository at top of test file**

Add these mocks after the existing `mockPickFiles` mock (around line 13):

```typescript
// Mock pickFolder for repository combobox
const mockPickFolder = vi.fn<() => Promise<string | null>>();
vi.mock('@/components/common/add-repository-button/pick-folder', () => ({
  pickFolder: () => mockPickFolder(),
}));

// Mock addRepository server action
const mockAddRepository =
  vi.fn<
    (input: {
      path: string;
      name?: string;
    }) => Promise<{ repository?: { id: string; name: string; path: string }; error?: string }>
  >();
vi.mock('@/app/actions/add-repository', () => ({
  addRepository: (input: { path: string; name?: string }) => mockAddRepository(input),
}));
```

Add to `beforeEach` (around line 41):

```typescript
mockPickFolder.mockResolvedValue(null);
mockAddRepository.mockResolvedValue({ error: 'Not mocked' });
```

- [ ] **Step 2: Add test — "Add new repository" item renders in combobox**

Add to the existing `describe('repository selector')` block (after line 1088):

```typescript
it('renders "Add new repository..." item in the combobox dropdown', async () => {
  const user = userEvent.setup();
  renderDrawer({ repositoryPath: '', repositories: sampleRepos });

  await user.click(screen.getByTestId('repository-combobox'));

  expect(screen.getByTestId('add-repository-item')).toBeInTheDocument();
  expect(screen.getByText('Add new repository...')).toBeInTheDocument();
});
```

- [ ] **Step 3: Add test — shows combobox even with zero repos**

```typescript
it('shows repo selector with add option when repositories is empty array', () => {
  renderDrawer({ repositoryPath: '', repositories: [] });
  expect(screen.getByTestId('repo-selector-section')).toBeInTheDocument();
  expect(screen.getByTestId('repository-combobox')).toBeInTheDocument();
});
```

- [ ] **Step 4: Add test — "Add new repository" item visible with zero repos**

```typescript
it('renders "Add new repository..." item even with zero repos', async () => {
  const user = userEvent.setup();
  renderDrawer({ repositoryPath: '', repositories: [] });

  await user.click(screen.getByTestId('repository-combobox'));

  expect(screen.getByTestId('add-repository-item')).toBeInTheDocument();
});
```

- [ ] **Step 5: Add test — clicking "Add new repository" calls pickFolder then addRepository**

```typescript
it('clicking "Add new repository..." opens folder picker and adds repo', async () => {
  mockPickFolder.mockResolvedValue('/Users/dev/new-project');
  mockAddRepository.mockResolvedValue({
    repository: { id: 'repo-new', name: 'new-project', path: '/Users/dev/new-project' },
  });
  const user = userEvent.setup();
  renderDrawer({ repositoryPath: '', repositories: sampleRepos });

  await user.click(screen.getByTestId('repository-combobox'));
  await user.click(screen.getByTestId('add-repository-item'));

  await waitFor(() => {
    expect(mockPickFolder).toHaveBeenCalledOnce();
    expect(mockAddRepository).toHaveBeenCalledWith({ path: '/Users/dev/new-project' });
  });

  // New repo should be auto-selected (combobox trigger shows the name)
  await waitFor(() => {
    expect(screen.getByTestId('repository-combobox')).toHaveTextContent('new-project');
  });
});
```

- [ ] **Step 6: Add test — cancelling folder picker does nothing**

```typescript
it('does nothing when folder picker is cancelled', async () => {
  mockPickFolder.mockResolvedValue(null);
  const user = userEvent.setup();
  renderDrawer({ repositoryPath: '', repositories: sampleRepos });

  await user.click(screen.getByTestId('repository-combobox'));
  await user.click(screen.getByTestId('add-repository-item'));

  await waitFor(() => {
    expect(mockPickFolder).toHaveBeenCalledOnce();
  });
  expect(mockAddRepository).not.toHaveBeenCalled();
  // Combobox should still show placeholder
  expect(screen.getByTestId('repository-combobox')).toHaveTextContent('Select repository...');
});
```

- [ ] **Step 7: Add test — shows error when addRepository fails**

```typescript
it('shows inline error when addRepository server action fails', async () => {
  mockPickFolder.mockResolvedValue('/Users/dev/bad-folder');
  mockAddRepository.mockResolvedValue({ error: 'Not a git repository' });
  const user = userEvent.setup();
  renderDrawer({ repositoryPath: '', repositories: sampleRepos });

  await user.click(screen.getByTestId('repository-combobox'));
  await user.click(screen.getByTestId('add-repository-item'));

  await waitFor(() => {
    expect(screen.getByTestId('add-repository-error')).toBeInTheDocument();
    expect(screen.getByText('Not a git repository')).toBeInTheDocument();
  });
  // Combobox should still be open (popover stays open on error)
  expect(screen.getByTestId('repository-combobox-content')).toBeInTheDocument();
});
```

- [ ] **Step 8: Add test — submit works after adding new repo inline**

```typescript
it('can submit feature after adding new repo via combobox', async () => {
  mockPickFolder.mockResolvedValue('/Users/dev/new-project');
  mockAddRepository.mockResolvedValue({
    repository: { id: 'repo-new', name: 'new-project', path: '/Users/dev/new-project' },
  });
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  renderDrawer({ repositoryPath: '', repositories: [], onSubmit });

  // Add repo via combobox
  await user.click(screen.getByTestId('repository-combobox'));
  await user.click(screen.getByTestId('add-repository-item'));
  await waitFor(() => {
    expect(screen.getByTestId('repository-combobox')).toHaveTextContent('new-project');
  });

  // Fill description and submit
  await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My feature');
  await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onSubmit.mock.calls[0][0].repositoryPath).toBe('/Users/dev/new-project');
});
```

- [ ] **Step 9: Run tests to verify they fail**

Run: `pnpm test:unit -- --reporter=verbose tests/unit/presentation/web/components/common/feature-create-drawer/feature-create-drawer.test.tsx`

Expected: New tests FAIL (add-repository-item test IDs don't exist, showRepoSelector still requires length > 0).

- [ ] **Step 10: Commit failing tests**

```bash
git add tests/unit/presentation/web/components/common/feature-create-drawer/feature-create-drawer.test.tsx
git commit -m "test(web): add failing tests for add-repository-in-combobox feature"
```

---

### Task 2: Implement RepositoryCombobox "Add new repository" item

**Files:**

- Modify: `src/presentation/web/components/common/feature-create-drawer/feature-create-drawer.tsx`

- [ ] **Step 1: Add imports**

At the top of `feature-create-drawer.tsx`, add to the existing `lucide-react` import (line 4):

```typescript
// Add FolderPlus and Loader2 to the existing import
import { PaperclipIcon, ChevronsUpDown, CheckIcon, Zap, FolderPlus, Loader2 } from 'lucide-react';
```

Add new imports after the existing imports (around line 21):

```typescript
import { Separator } from '@/components/ui/separator';
import { pickFolder } from '@/components/common/add-repository-button/pick-folder';
import { addRepository } from '@/app/actions/add-repository';
```

- [ ] **Step 2: Update RepositoryComboboxProps**

At line 1069, update the interface:

```typescript
export interface RepositoryComboboxProps {
  repositories: RepositoryOption[];
  value: string | undefined;
  onChange: (path: string | undefined) => void;
  onAddRepository?: (repo: RepositoryOption) => void;
  disabled?: boolean;
}
```

- [ ] **Step 3: Update RepositoryCombobox function signature and add state**

Update the component at line 1076:

```typescript
export function RepositoryCombobox({
  repositories,
  value,
  onChange,
  onAddRepository,
  disabled,
}: RepositoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 4: Add handleAddRepository function**

After `handleSelect` (around line 1103), add:

```typescript
const handleAddRepository = useCallback(async () => {
  if (isAdding) return;
  setIsAdding(true);
  setAddError(null);
  try {
    const folderPath = await pickFolder();
    if (!folderPath) {
      setIsAdding(false);
      return;
    }
    const result = await addRepository({ path: folderPath });
    if (result.error) {
      setAddError(result.error);
      setIsAdding(false);
      return;
    }
    if (result.repository) {
      const newRepo: RepositoryOption = {
        id: result.repository.id,
        name: result.repository.name,
        path: result.repository.path,
      };
      onAddRepository?.(newRepo);
      onChange(newRepo.path);
      setOpen(false);
      setQuery('');
    }
  } catch (err: unknown) {
    setAddError(err instanceof Error ? err.message : 'Failed to add repository');
  } finally {
    setIsAdding(false);
  }
}, [isAdding, onAddRepository, onChange]);
```

- [ ] **Step 5: Update the dropdown JSX — add pinned footer with "Add new repository..." item**

Replace the popover content (the `<div className="flex flex-col">` block inside `PopoverContent`) with:

```tsx
<div className="flex flex-col">
  {/* Search input */}
  <div className="border-b p-2">
    <Input
      ref={inputRef}
      placeholder="Search repositories..."
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      className="h-8 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
      data-testid="repository-search"
    />
  </div>

  {/* Options list */}
  <div className="max-h-48 overflow-y-auto py-1" role="listbox" aria-label="Repositories">
    {filtered.length === 0 ? (
      <p className="text-muted-foreground px-3 py-2 text-sm" data-testid="repository-empty">
        No repositories found.
      </p>
    ) : (
      filtered.map((r) => (
        <button
          key={r.id}
          type="button"
          role="option"
          aria-selected={value === r.path}
          onClick={() => handleSelect(r.path)}
          className={cn(
            'hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-sm',
            value === r.path && 'bg-accent/50'
          )}
          data-testid={`repository-option-${r.id}`}
        >
          <CheckIcon className={cn('h-4 w-4 shrink-0', value !== r.path && 'invisible')} />
          <span className="flex flex-col items-start truncate">
            <span className="truncate">{r.name}</span>
            <span className="text-muted-foreground truncate text-xs">{r.path}</span>
          </span>
        </button>
      ))
    )}
  </div>

  {/* Add new repository — pinned outside scroll area */}
  <Separator />
  <button
    type="button"
    onClick={handleAddRepository}
    disabled={isAdding}
    className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 px-3 py-2 text-sm"
    data-testid="add-repository-item"
  >
    {isAdding ? (
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
    ) : (
      <FolderPlus className="h-4 w-4 shrink-0" />
    )}
    <span>Add new repository...</span>
  </button>
  {addError ? (
    <p className="px-3 pb-2 text-xs text-red-500" data-testid="add-repository-error">
      {addError}
    </p>
  ) : null}
</div>
```

- [ ] **Step 6: Run tests to verify "Add new repository" tests pass**

Run: `pnpm test:unit -- --reporter=verbose tests/unit/presentation/web/components/common/feature-create-drawer/feature-create-drawer.test.tsx`

Expected: The new add-repository tests pass, but the zero-repos test still fails (showRepoSelector condition not updated yet).

- [ ] **Step 7: Commit**

```bash
git add src/presentation/web/components/common/feature-create-drawer/feature-create-drawer.tsx
git commit -m "feat(web): add 'add new repository' item to repository combobox dropdown"
```

---

### Task 3: Update showRepoSelector to show combobox with zero repos + add localRepos state

**Files:**

- Modify: `src/presentation/web/components/common/feature-create-drawer/feature-create-drawer.tsx`

- [ ] **Step 1: Update showRepoSelector condition**

At line 519, change:

```typescript
// Before
const showRepoSelector = !repositoryPath && repositories && repositories.length > 0;

// After
const showRepoSelector = !repositoryPath && repositories !== undefined;
```

- [ ] **Step 2: Add localRepos state**

After `selectedRepoPath` state (around line 200), add:

```typescript
const [localRepos, setLocalRepos] = useState<RepositoryOption[]>(repositories ?? []);
```

Add a sync effect (after the `workflowDefaults` sync effect, around line 219):

```typescript
// Sync localRepos when repositories prop changes
useEffect(() => {
  setLocalRepos(repositories ?? []);
}, [repositories]);
```

- [ ] **Step 3: Add localRepos to resetForm**

In `resetForm` (around line 228), add:

```typescript
setLocalRepos(repositories ?? []);
```

And add `repositories` to the dependency array of `resetForm` if not already present.

- [ ] **Step 4: Update RepositoryCombobox usage in JSX**

Replace the `<RepositoryCombobox>` usage (around line 575) with:

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

- [ ] **Step 5: Run tests to verify zero-repos and all add-repo tests pass**

Run: `pnpm test:unit -- --reporter=verbose tests/unit/presentation/web/components/common/feature-create-drawer/feature-create-drawer.test.tsx`

Expected: All new tests pass. The old test `does not show repo selector when repositoryPath is empty and repositories is empty` will now FAIL — it expects `repo-selector-section` to NOT be in the document, but now it should be. Update this test.

- [ ] **Step 6: Update the old zero-repos test**

In the test file at line 1085, update:

```typescript
// Before:
it('does not show repo selector when repositoryPath is empty and repositories is empty', () => {
  renderDrawer({ repositoryPath: '', repositories: [] });
  expect(screen.queryByTestId('repo-selector-section')).not.toBeInTheDocument();
});

// After:
it('shows repo selector with add option when repositoryPath is empty and repositories is empty', () => {
  renderDrawer({ repositoryPath: '', repositories: [] });
  expect(screen.getByTestId('repo-selector-section')).toBeInTheDocument();
  expect(screen.getByTestId('repository-combobox')).toBeInTheDocument();
});
```

**Important:** Delete the test added in Task 1 Step 3 (it was the red-phase duplicate). This updated test at line 1085 is the canonical one.

- [ ] **Step 7: Run all tests to verify green**

Run: `pnpm test:unit -- --reporter=verbose tests/unit/presentation/web/components/common/feature-create-drawer/feature-create-drawer.test.tsx`

Expected: ALL tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/presentation/web/components/common/feature-create-drawer/feature-create-drawer.tsx tests/unit/presentation/web/components/common/feature-create-drawer/feature-create-drawer.test.tsx
git commit -m "feat(web): show repository combobox with zero repos and wire up local repos state"
```

---

## Chunk 2: Sidebar cleanup + stories

### Task 4: Remove hasRepositories gating from AppSidebar

**Files:**

- Modify: `src/presentation/web/components/layouts/app-sidebar/app-sidebar.tsx`
- Modify: `src/presentation/web/components/layouts/app-shell/app-shell.tsx`
- Modify: `src/presentation/web/components/layouts/app-sidebar/app-sidebar.stories.tsx`

- [ ] **Step 1: Update AppSidebar — remove hasRepositories prop**

In `app-sidebar.tsx`, remove `hasRepositories` from the interface (line 44) and destructured props (line 52). Replace the footer section (lines 167–182) with:

```tsx
<SidebarMenuButton onClick={onNewFeature} tooltip="New feature">
  <Plus />
  <span>New feature</span>
</SidebarMenuButton>
```

Remove the `Tooltip`, `TooltipTrigger`, `TooltipContent` imports (line 16) — they are only used in the removed block.

- [ ] **Step 2: Update AppShell — remove hasRepositories passing**

In `app-shell.tsx`:

- Remove the `SidebarRepositoryCountProvider` import and `useSidebarRepositoryCount` import (lines 17–19)
- Remove `const { repositoryCount } = useSidebarRepositoryCount();` (line 37)
- Remove `hasRepositories={repositoryCount > 0}` from `<AppSidebar>` props (line 59)
- Remove `<SidebarRepositoryCountProvider>` wrapper from the `AppShell` component (lines 82–84)

- [ ] **Step 3: Remove sidebar-repository-count-context.tsx**

Delete: `src/presentation/web/hooks/sidebar-repository-count-context.tsx`

- [ ] **Step 4: Remove useSidebarRepositoryCount from control-center-inner.tsx**

In `src/presentation/web/components/features/control-center/control-center-inner.tsx`:

- Remove the import of `useSidebarRepositoryCount` (around line 68 area based on grep)
- Remove `const { setRepositoryCount } = useSidebarRepositoryCount();`
- Remove the `repositoryNodeCount` useMemo and the `useEffect` that calls `setRepositoryCount`

- [ ] **Step 5: Update AppSidebar stories — remove DisabledNoRepos**

In `app-sidebar.stories.tsx`, delete the `DisabledNoRepos` story (lines 146–151).

- [ ] **Step 6: Run validate to check for compile errors**

Run: `pnpm validate`

Expected: No type errors related to the removed prop/context.

- [ ] **Step 7: Run full test suite**

Run: `pnpm test:unit`

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/presentation/web/components/layouts/app-sidebar/app-sidebar.tsx src/presentation/web/components/layouts/app-shell/app-shell.tsx src/presentation/web/hooks/sidebar-repository-count-context.tsx src/presentation/web/components/features/control-center/control-center-inner.tsx src/presentation/web/components/layouts/app-sidebar/app-sidebar.stories.tsx
git commit -m "refactor(web): remove hasRepositories gating from sidebar new feature button"
```

---

### Task 5: Update Storybook stories

**Files:**

- Modify: `src/presentation/web/components/common/feature-create-drawer/repository-combobox.stories.tsx`
- Modify: `src/presentation/web/components/common/feature-create-drawer/feature-create-drawer.stories.tsx`

- [ ] **Step 1: Fix Storybook mocks for pickFolder and addRepository**

Update `.storybook/mocks/app/actions/pick-folder.ts` — the current mock returns `{ error: 'Not available in Storybook' }` which causes the `pickFolder` wrapper to throw. Change to simulate cancellation:

```typescript
export async function pickFolder(): Promise<{ path: string | null; error?: string }> {
  return { path: null };
}
```

Update `.storybook/mocks/app/actions/add-repository.ts` — return a simulated success instead of error:

```typescript
export async function addRepository(input: {
  path: string;
  name?: string;
}): Promise<{ repository?: { id: string; name: string; path: string }; error?: string }> {
  const name = input.name ?? input.path.split('/').pop() ?? 'unknown';
  return {
    repository: {
      id: `repo-${Date.now()}`,
      name,
      path: input.path,
    },
  };
}
```

- [ ] **Step 2: Update RepositoryCombobox stories**

Replace `repository-combobox.stories.tsx` with:

```tsx
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { RepositoryCombobox } from './feature-create-drawer';
import type { RepositoryOption } from './feature-create-drawer';

const SAMPLE_REPOSITORIES: RepositoryOption[] = [
  { id: 'repo-001', name: 'my-app', path: '/Users/dev/projects/my-app' },
  { id: 'repo-002', name: 'api-service', path: '/Users/dev/projects/api-service' },
  { id: 'repo-003', name: 'shared-lib', path: '/Users/dev/libs/shared-lib' },
  { id: 'repo-004', name: 'docs-site', path: '/Users/dev/projects/docs-site' },
];

const meta: Meta<typeof RepositoryCombobox> = {
  title: 'Drawers/Feature/RepositoryCombobox',
  component: RepositoryCombobox,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof RepositoryCombobox>;

function RepositoryComboboxWrapper({
  repositories: initialRepos,
  initialValue,
  disabled,
}: {
  repositories: RepositoryOption[];
  initialValue?: string;
  disabled?: boolean;
}) {
  const [repos, setRepos] = useState<RepositoryOption[]>(initialRepos);
  const [value, setValue] = useState<string | undefined>(initialValue);

  return (
    <div className="w-80">
      <RepositoryCombobox
        repositories={repos}
        value={value}
        onChange={setValue}
        onAddRepository={(repo) => {
          setRepos((prev) => [...prev, repo]);
          setValue(repo.path);
        }}
        disabled={disabled}
      />
      {value ? <p className="text-muted-foreground mt-2 text-xs">Selected: {value}</p> : null}
    </div>
  );
}

/** Default state with multiple repositories available for selection. */
export const WithRepositories: Story = {
  render: () => <RepositoryComboboxWrapper repositories={SAMPLE_REPOSITORIES} />,
};

/** Empty list — shows "No repositories found." message and "Add new repository..." option. */
export const EmptyList: Story = {
  render: () => <RepositoryComboboxWrapper repositories={[]} />,
};

/** Pre-selected repository — trigger button shows the selected repo name. */
export const PreSelected: Story = {
  render: () => (
    <RepositoryComboboxWrapper
      repositories={SAMPLE_REPOSITORIES}
      initialValue="/Users/dev/projects/api-service"
    />
  ),
};

/** Disabled state — combobox trigger button is non-interactive. */
export const Disabled: Story = {
  render: () => <RepositoryComboboxWrapper repositories={SAMPLE_REPOSITORIES} disabled />,
};
```

- [ ] **Step 3: Update FeatureCreateDrawer WithRepoSelectorEmpty story**

In `feature-create-drawer.stories.tsx`, update the story description (around line 640):

```typescript
/**
 * With empty repo selector — opened from sidebar but no repositories are tracked.
 * Shows the combobox with only the "Add new repository..." option.
 * The submit button remains disabled until a repository is added.
 */
```

- [ ] **Step 4: Run Storybook build to verify no breakage**

Run: `pnpm build:storybook 2>&1 | tail -20`

Expected: Build succeeds without errors.

- [ ] **Step 5: Commit**

```bash
git add .storybook/mocks/app/actions/pick-folder.ts .storybook/mocks/app/actions/add-repository.ts src/presentation/web/components/common/feature-create-drawer/repository-combobox.stories.tsx src/presentation/web/components/common/feature-create-drawer/feature-create-drawer.stories.tsx
git commit -m "docs(web): update storybook stories and mocks for add-repository-in-combobox"
```

---

### Task 6: Final validation

- [ ] **Step 1: Run full validation suite**

Run: `pnpm validate`

Expected: All lint, format, and typecheck passes.

- [ ] **Step 2: Run full unit tests**

Run: `pnpm test:unit`

Expected: All tests pass.

- [ ] **Step 3: Run Storybook build**

Run: `pnpm build:storybook 2>&1 | tail -5`

Expected: Build succeeds.
