# GitHub Remote Init — UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a web UI surface (canvas badge + drawer form) for `shep repo init-remote` so users can create a GitHub remote from the Control Center without using the CLI.

**Architecture:** Extend the existing git info cache in `get-graph-data.ts` to track `hasRemote` per repo, propagate it through `build-graph-nodes.ts` and `derive-graph.ts` into `RepositoryNodeData`, then surface it via a `CloudOff` badge on the canvas node and an `InitRemoteSection` form in the repository drawer. A new server action calls `InitRemoteRepositoryUseCase` (already implemented) and invalidates the git cache on success.

**Tech Stack:** TypeScript, Next.js 15 App Router, React, shadcn/ui, lucide-react, tsyringe DI, Vitest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/presentation/web/components/common/repository-node/repository-node-config.ts` | Modify | Add `hasRemote?: boolean` to `RepositoryNodeData` |
| `src/presentation/web/app/(dashboard)/get-graph-data.ts` | Modify | Add `hasRemote` to `RepoGitInfo`, fetch before SHA check, export `invalidateRepoGitCache` |
| `src/presentation/web/app/build-graph-nodes.ts` | Modify | Add `hasRemote` to inline options type, spread into real node data, set `true` on virtual nodes |
| `src/presentation/web/lib/derive-graph.ts` | Modify | Set `hasRemote: true` on virtual nodes (real nodes inherit via spread) |
| `src/presentation/web/components/common/repository-node/repository-node.tsx` | Modify | Add `CloudOff` badge with tooltip when `gitInfoStatus === 'ready' && hasRemote === false` |
| `src/presentation/web/components/common/repository-node/init-remote-section.tsx` | Create | Shared form component: name, visibility, org fields; success/error states |
| `src/presentation/web/components/common/repository-node/repository-drawer.tsx` | Modify | Render `InitRemoteSection` when condition met |
| `src/presentation/web/components/common/control-center-drawer/repository-drawer-client.tsx` | Modify | Render `InitRemoteSection` when condition met |
| `src/presentation/web/app/actions/init-remote-repository.ts` | Create | Server action: findById, isPublic inversion, GitPrErrorCode discrimination, cache invalidation |
| `.storybook/mocks/app/actions/init-remote-repository.ts` | Create | Storybook mock returning `{ repoUrl }` |
| `src/presentation/web/components/common/repository-node/repository-drawer.stories.tsx` | Modify | Add 5 story variants covering `hasRemote` states |
| `tests/unit/presentation/web/app/build-graph-nodes.test.ts` | Modify | Tests for `hasRemote` propagation |
| `tests/unit/presentation/web/app/actions/init-remote-repository.test.ts` | Create | Unit tests for server action |

---

## Task 1: Extend `RepositoryNodeData` with `hasRemote`

**Files:**
- Modify: `src/presentation/web/components/common/repository-node/repository-node-config.ts`

- [ ] **Step 1: Add the field**

  Open `repository-node-config.ts`. After the `gitInfoStatus` field, add:

  ```typescript
  /** Whether the repository has a configured git remote. undefined when gitInfoStatus !== 'ready'. */
  hasRemote?: boolean;
  ```

- [ ] **Step 2: Validate with typecheck**

  ```bash
  pnpm validate
  ```

  Expected: no type errors introduced.

- [ ] **Step 3: Commit**

  ```bash
  git add src/presentation/web/components/common/repository-node/repository-node-config.ts
  git commit -m "feat(web): add hasRemote field to RepositoryNodeData"
  ```

---

## Task 2: Fetch `hasRemote` in `get-graph-data.ts`

**Files:**
- Modify: `src/presentation/web/app/(dashboard)/get-graph-data.ts`

- [ ] **Step 1: Add `hasRemote` to `RepoGitInfo`**

  Find the `RepoGitInfo` interface (line 19) and add the new field:

  ```typescript
  export interface RepoGitInfo {
    branch: string;
    commitMessage: string;
    committer: string;
    behindCount: number | null;
    hasRemote: boolean;
  }
  ```

- [ ] **Step 2: Fetch `hasRemote` before SHA check in `refreshRepoGitInfo`**

  The current `refreshRepoGitInfo` returns early at two points. `hasRemote` must be fetched after the `!headSha` guard (so we know it's a real repo) but before the SHA equality check (so it's always fresh). Replace the section from the `headSha` check through the SHA early-return:

  ```typescript
  async function refreshRepoGitInfo(repo: Repository): Promise<void> {
    try {
      const headSha = await gitCommand(repo.path, ['rev-parse', 'HEAD']);
      if (!headSha) {
        gitInfoCache.set(repo.path, { kind: 'not-a-repo', checkedAt: Date.now() });
        return;
      }

      // Always check hasRemote — adding a remote does NOT change HEAD
      const remoteUrl = await gitCommand(repo.path, ['remote', 'get-url', 'origin']);
      const hasRemote = remoteUrl !== null && remoteUrl.length > 0;

      const cached = gitInfoCache.get(repo.path);
      if (cached?.kind === 'repo' && cached.sha === headSha) {
        // HEAD unchanged — bump checkedAt and refresh hasRemote (remote can change without HEAD change)
        cached.checkedAt = Date.now();
        cached.data.hasRemote = hasRemote;
        return;
      }

      // HEAD changed — fetch branch + subject & author in parallel
      // ... rest of function unchanged, add hasRemote to the final gitInfoCache.set() call
  ```

  In the final `gitInfoCache.set()` at the bottom of `refreshRepoGitInfo`, add `hasRemote` to the `data` object:

  ```typescript
  gitInfoCache.set(repo.path, {
    kind: 'repo',
    sha: headSha,
    checkedAt: Date.now(),
    data: {
      branch: currentBranch,
      commitMessage: commitMessage ?? 'unknown',
      committer: committer ?? 'unknown',
      behindCount,
      hasRemote,
    },
  });
  ```

- [ ] **Step 3: Export `invalidateRepoGitCache`**

  After the `gitInfoCache` declaration, add:

  ```typescript
  /** Evict a repo from the git info cache so the next getGraphData() call fetches fresh data. */
  export function invalidateRepoGitCache(repoPath: string): void {
    gitInfoCache.delete(repoPath);
  }
  ```

- [ ] **Step 4: Commit** (do NOT run `pnpm validate` here — adding `hasRemote` to `RepoGitInfo` will cause a type error in `build-graph-nodes.ts` until the inline type is updated in Task 3)

  ```bash
  git add "src/presentation/web/app/(dashboard)/get-graph-data.ts"
  git commit -m "feat(web): fetch hasRemote in git info cache, export invalidateRepoGitCache"
  ```

---

## Task 3: Propagate `hasRemote` through `build-graph-nodes.ts`

**Files:**
- Modify: `src/presentation/web/app/build-graph-nodes.ts`
- Modify: `tests/unit/presentation/web/app/build-graph-nodes.test.ts`

- [ ] **Step 1: Write failing tests**

  In `build-graph-nodes.test.ts`, add a new `describe` block after the existing ones:

  ```typescript
  describe('repository node hasRemote field', () => {
    it('sets hasRemote: true on a real repo node when repoGitInfo has hasRemote: true', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const repoGitInfo = new Map([
        [
          '/my/repo',
          {
            branch: 'main',
            commitMessage: 'init',
            committer: 'Alice',
            behindCount: 0,
            hasRemote: true,
          },
        ],
      ]);
      const { nodes } = buildGraphNodes([repo], [], { repoGitInfo });
      const repoNode = nodes.find((n) => n.id === 'repo-repo-1');
      expect((repoNode!.data as Record<string, unknown>).hasRemote).toBe(true);
    });

    it('sets hasRemote: false on a real repo node when repoGitInfo has hasRemote: false', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const repoGitInfo = new Map([
        [
          '/my/repo',
          {
            branch: 'main',
            commitMessage: 'init',
            committer: 'Alice',
            behindCount: 0,
            hasRemote: false,
          },
        ],
      ]);
      const { nodes } = buildGraphNodes([repo], [], { repoGitInfo });
      const repoNode = nodes.find((n) => n.id === 'repo-repo-1');
      expect((repoNode!.data as Record<string, unknown>).hasRemote).toBe(false);
    });

    it('sets hasRemote: true on virtual repo nodes (suppress init-remote form)', () => {
      const feature = makeFeature({ repositoryPath: '/orphan/repo' });
      const { nodes } = buildGraphNodes([], [{ feature, run: null }]);
      const virtualNode = nodes.find((n) => n.id === 'virtual-repo-/orphan/repo');
      expect((virtualNode!.data as Record<string, unknown>).hasRemote).toBe(true);
    });

    it('leaves hasRemote undefined on real repo node when repoGitInfo not provided', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const { nodes } = buildGraphNodes([repo], []);
      const repoNode = nodes.find((n) => n.id === 'repo-repo-1');
      expect((repoNode!.data as Record<string, unknown>).hasRemote).toBeUndefined();
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm test:unit -- --reporter=verbose tests/unit/presentation/web/app/build-graph-nodes.test.ts
  ```

  Expected: the 4 new tests fail (hasRemote missing from node data).

- [ ] **Step 3: Update `BuildGraphNodesOptions.repoGitInfo` inline type**

  In `build-graph-nodes.ts`, update the `repoGitInfo` type in `BuildGraphNodesOptions` (lines 44-47):

  ```typescript
  /** Git info (branch, commit message, committer, behind count, hasRemote) keyed by repository path */
  repoGitInfo?: Map<
    string,
    { branch: string; commitMessage: string; committer: string; behindCount: number | null; hasRemote: boolean }
  >;
  ```

- [ ] **Step 4: Spread `hasRemote` into real repo node data**

  In `buildGraphNodes`, the real repo node data spread (around line 94-99):

  ```typescript
  ...(gitInfo && {
    branch: gitInfo.branch,
    commitMessage: gitInfo.commitMessage,
    committer: gitInfo.committer,
    behindCount: gitInfo.behindCount,
    hasRemote: gitInfo.hasRemote,
  }),
  ```

- [ ] **Step 5: Set `hasRemote: true` on virtual repo nodes**

  Find the virtual node data (line 125):

  ```typescript
  data: { name: repoName, repositoryPath: repoPath, hasRemote: true },
  ```

- [ ] **Step 6: Run tests to confirm they pass**

  ```bash
  pnpm test:unit -- --reporter=verbose tests/unit/presentation/web/app/build-graph-nodes.test.ts
  ```

  Expected: all tests pass including the 4 new ones.

- [ ] **Step 7: Full test suite**

  ```bash
  pnpm test:unit
  ```

  Expected: zero failures.

- [ ] **Step 8: Commit**

  ```bash
  git add src/presentation/web/app/build-graph-nodes.ts tests/unit/presentation/web/app/build-graph-nodes.test.ts
  git commit -m "feat(web): propagate hasRemote through build-graph-nodes pipeline"
  ```

---

## Task 4: Set `hasRemote: true` on virtual nodes in `derive-graph.ts`

**Files:**
- Modify: `src/presentation/web/lib/derive-graph.ts`

Real repo nodes in `derive-graph.ts` already inherit `hasRemote` via the `...entry.data` spread at line 114 — no change needed for real nodes. Only virtual nodes need the explicit `hasRemote: true`.

- [ ] **Step 1: Update the virtual node creation in `getOrCreateVirtualRepo`**

  Find `getOrCreateVirtualRepo` (around line 86-100). Update the node data:

  ```typescript
  data: { name: repoName, repositoryPath, hasRemote: true } satisfies RepositoryNodeData,
  ```

- [ ] **Step 2: Validate with typecheck**

  ```bash
  pnpm validate
  ```

  Expected: no type errors.

- [ ] **Step 3: Add a unit test confirming virtual nodes in `deriveGraph` have `hasRemote: true`**

  Create `tests/unit/presentation/web/lib/derive-graph.test.ts` (or add to an existing file if one exists):

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { deriveGraph } from '@/lib/derive-graph';
  import { SdlcLifecycle } from '@shepai/core/domain/generated/output';
  import type { FeatureEntry } from '@/lib/derive-graph';

  const makeFeatureEntry = (repositoryPath: string): FeatureEntry => ({
    nodeId: 'feat-1',
    data: {
      name: 'My Feature',
      description: 'desc',
      featureId: 'feat-1',
      lifecycle: 'requirements',
      repositoryPath,
      branch: 'feat/my-feature',
      worktreePath: '/tmp/wt',
      state: 'pending',
      progress: null,
      push: false,
      openPr: false,
      approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    },
  });

  describe('deriveGraph — virtual repo nodes', () => {
    it('sets hasRemote: true on virtual repo nodes created for orphaned features', () => {
      const featureMap = new Map([['feat-1', makeFeatureEntry('/orphan/repo')]]);
      const { nodes } = deriveGraph(featureMap, new Map(), new Map());
      const virtualNode = nodes.find((n) => n.id === 'virtual-repo-/orphan/repo');
      expect(virtualNode).toBeDefined();
      expect((virtualNode!.data as Record<string, unknown>).hasRemote).toBe(true);
    });
  });
  ```

  Run to confirm it fails, implement (Step 1 already done), then run to confirm it passes:

  ```bash
  pnpm test:unit -- --reporter=verbose tests/unit/presentation/web/lib/derive-graph.test.ts
  ```

  Expected: passes after the Step 1 change.

- [ ] **Step 4: Full unit tests**

  ```bash
  pnpm test:unit
  ```

  Expected: zero failures.

- [ ] **Step 5: Commit**

  ```bash
  git add src/presentation/web/lib/derive-graph.ts tests/unit/presentation/web/lib/derive-graph.test.ts
  git commit -m "feat(web): set hasRemote: true on virtual nodes in derive-graph"
  ```

---

## Task 5: Create `initRemoteRepository` server action

**Files:**
- Create: `src/presentation/web/app/actions/init-remote-repository.ts`
- Create: `tests/unit/presentation/web/app/actions/init-remote-repository.test.ts`

- [ ] **Step 1: Write failing tests**

  Create `tests/unit/presentation/web/app/actions/init-remote-repository.test.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { GitPrError, GitPrErrorCode } from '@shepai/core/application/ports/output/services/git-pr-service.interface';

  // All vi.mock() calls MUST be at the top — Vitest hoists them before imports
  const mockFindById = vi.fn();
  const mockExecute = vi.fn();

  vi.mock('@/lib/server-container', () => ({
    resolve: vi.fn((token: string) => {
      if (token === 'IRepositoryRepository') return { findById: mockFindById };
      if (token === 'InitRemoteRepositoryUseCase') return { execute: mockExecute };
      throw new Error(`Unknown token: ${token}`);
    }),
  }));

  vi.mock('@/app/(dashboard)/get-graph-data', () => ({
    invalidateRepoGitCache: vi.fn(),
  }));

  vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
  }));

  // Dynamic imports AFTER all vi.mock() declarations
  const { initRemoteRepository } = await import('@/app/actions/init-remote-repository');
  const { invalidateRepoGitCache } = await import('@/app/(dashboard)/get-graph-data');

  describe('initRemoteRepository', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns error when repositoryId is missing', async () => {
      const result = await initRemoteRepository({ repositoryId: '', name: 'my-repo', isPrivate: true });
      expect(result).toEqual({ error: 'Repository id is required' });
    });

    it('returns error when repository is not found', async () => {
      mockFindById.mockResolvedValue(null);
      const result = await initRemoteRepository({ repositoryId: 'repo-1', name: 'my-repo', isPrivate: true });
      expect(result).toEqual({ error: 'Repository not found.' });
    });

    it('calls use case with isPublic: false when isPrivate: true', async () => {
      mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
      mockExecute.mockResolvedValue({ repoUrl: 'https://github.com/user/my-repo', repoName: 'my-repo', isPrivate: true });
      await initRemoteRepository({ repositoryId: 'repo-1', name: 'my-repo', isPrivate: true });
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/my/repo', isPublic: false })
      );
    });

    it('calls use case with isPublic: true when isPrivate: false', async () => {
      mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
      mockExecute.mockResolvedValue({ repoUrl: 'https://github.com/user/my-repo', repoName: 'my-repo', isPrivate: false });
      await initRemoteRepository({ repositoryId: 'repo-1', name: 'my-repo', isPrivate: false });
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ isPublic: true })
      );
    });

    it('returns repoUrl on success and invalidates cache', async () => {
      mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
      mockExecute.mockResolvedValue({ repoUrl: 'https://github.com/user/my-repo', repoName: 'my-repo', isPrivate: true });
      const result = await initRemoteRepository({ repositoryId: 'repo-1', name: 'my-repo', isPrivate: true });
      expect(result).toEqual({ repoUrl: 'https://github.com/user/my-repo' });
      expect(invalidateRepoGitCache).toHaveBeenCalledWith('/my/repo');
    });

    it('maps GH_NOT_FOUND to actionable error message', async () => {
      mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
      mockExecute.mockRejectedValue(new GitPrError('not found', GitPrErrorCode.GH_NOT_FOUND));
      const result = await initRemoteRepository({ repositoryId: 'repo-1', name: 'my-repo', isPrivate: true });
      expect(result).toEqual({ error: 'gh CLI not found. Install with: brew install gh' });
    });

    it('maps AUTH_FAILURE to actionable error message', async () => {
      mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
      mockExecute.mockRejectedValue(new GitPrError('auth fail', GitPrErrorCode.AUTH_FAILURE));
      const result = await initRemoteRepository({ repositoryId: 'repo-1', name: 'my-repo', isPrivate: true });
      expect(result).toEqual({ error: 'gh CLI not authenticated. Run: gh auth login' });
    });

    it('maps REMOTE_ALREADY_EXISTS to actionable error message', async () => {
      mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
      mockExecute.mockRejectedValue(new GitPrError('exists', GitPrErrorCode.REMOTE_ALREADY_EXISTS));
      const result = await initRemoteRepository({ repositoryId: 'repo-1', name: 'my-repo', isPrivate: true });
      expect(result).toEqual({ error: 'This repository already has a remote configured.' });
    });

    it('returns raw error.message for unknown errors', async () => {
      mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
      mockExecute.mockRejectedValue(new Error('network timeout'));
      const result = await initRemoteRepository({ repositoryId: 'repo-1', name: 'my-repo', isPrivate: true });
      expect(result).toEqual({ error: 'network timeout' });
    });

    it('passes org to use case when provided', async () => {
      mockFindById.mockResolvedValue({ id: 'repo-1', path: '/my/repo' });
      mockExecute.mockResolvedValue({ repoUrl: 'https://github.com/myorg/my-repo', repoName: 'my-repo', isPrivate: true });
      await initRemoteRepository({ repositoryId: 'repo-1', name: 'my-repo', isPrivate: true, org: 'myorg' });
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ org: 'myorg' })
      );
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm test:unit -- --reporter=verbose tests/unit/presentation/web/app/actions/init-remote-repository.test.ts
  ```

  Expected: all tests fail — module doesn't exist yet.

- [ ] **Step 3: Create the server action**

  Create `src/presentation/web/app/actions/init-remote-repository.ts`:

  ```typescript
  'use server';

  import { revalidatePath } from 'next/cache';
  import { resolve } from '@/lib/server-container';
  import { invalidateRepoGitCache } from '@/app/(dashboard)/get-graph-data';
  import type { IRepositoryRepository } from '@shepai/core/application/ports/output/repositories/repository-repository.interface';
  import type { InitRemoteRepositoryUseCase } from '@shepai/core/application/use-cases/repositories/init-remote-repository.use-case';
  import {
    GitPrError,
    GitPrErrorCode,
  } from '@shepai/core/application/ports/output/services/git-pr-service.interface';

  export interface InitRemoteInput {
    repositoryId: string;
    name: string;
    isPrivate: boolean;
    org?: string;
  }

  export async function initRemoteRepository(
    input: InitRemoteInput
  ): Promise<{ repoUrl: string } | { error: string }> {
    if (!input.repositoryId?.trim()) {
      return { error: 'Repository id is required' };
    }

    try {
      const repoRepository = resolve<IRepositoryRepository>('IRepositoryRepository');
      const repository = await repoRepository.findById(input.repositoryId);

      if (!repository) {
        return { error: 'Repository not found.' };
      }

      const useCase = resolve<InitRemoteRepositoryUseCase>('InitRemoteRepositoryUseCase');
      const result = await useCase.execute({
        cwd: repository.path,
        name: input.name,
        isPublic: !input.isPrivate,
        org: input.org,
      });

      invalidateRepoGitCache(repository.path);
      revalidatePath('/', 'layout');

      return { repoUrl: result.repoUrl };
    } catch (error: unknown) {
      if (error instanceof GitPrError) {
        switch (error.code) {
          case GitPrErrorCode.GH_NOT_FOUND:
            return { error: 'gh CLI not found. Install with: brew install gh' };
          case GitPrErrorCode.AUTH_FAILURE:
            return { error: 'gh CLI not authenticated. Run: gh auth login' };
          case GitPrErrorCode.REMOTE_ALREADY_EXISTS:
            return { error: 'This repository already has a remote configured.' };
        }
      }
      return { error: error instanceof Error ? error.message : 'An unexpected error occurred' };
    }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm test:unit -- --reporter=verbose tests/unit/presentation/web/app/actions/init-remote-repository.test.ts
  ```

  Expected: all 9 tests pass.

- [ ] **Step 5: Full test suite**

  ```bash
  pnpm test:unit
  ```

  Expected: zero failures.

- [ ] **Step 6: Commit**

  ```bash
  git add src/presentation/web/app/actions/init-remote-repository.ts tests/unit/presentation/web/app/actions/init-remote-repository.test.ts
  git commit -m "feat(web): add initRemoteRepository server action"
  ```

---

## Task 6: Create `InitRemoteSection` component

**Files:**
- Create: `src/presentation/web/components/common/repository-node/init-remote-section.tsx`

The `basename` of `repositoryPath` is pre-filled as the default repo name. On success, the confirmation message displays for 5 seconds via a `setTimeout` cleaned up on unmount.

- [ ] **Step 1: Create the component**

  Create `src/presentation/web/components/common/repository-node/init-remote-section.tsx`:

  ```typescript
  'use client';

  import { useState, useEffect, useRef } from 'react';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
  import { Loader2 } from 'lucide-react';
  import { initRemoteRepository } from '@/app/actions/init-remote-repository';

  const SUCCESS_DISPLAY_MS = 5000;
  const ERROR_CLEAR_MS = 5000;

  export interface InitRemoteSectionProps {
    /** Repository UUID — maps to RepositoryNodeData.id */
    repositoryId: string;
    /** Absolute path to the repository — used to derive default repo name */
    repositoryPath: string;
    /** Test-only: pre-seeds the error state for Storybook stories */
    _initialErrorMessage?: string;
    /** Test-only: pre-seeds the success state for Storybook stories */
    _initialSuccessUrl?: string;
  }

  function deriveRepoName(repositoryPath: string): string {
    // Normalize Windows backslashes, then take the last non-empty segment
    const normalized = repositoryPath.replace(/\\/g, '/');
    return normalized.split('/').filter(Boolean).at(-1) ?? normalized;
  }

  export function InitRemoteSection({
    repositoryId,
    repositoryPath,
    _initialErrorMessage,
    _initialSuccessUrl,
  }: InitRemoteSectionProps) {
    const [name, setName] = useState(() => deriveRepoName(repositoryPath));
    const [isPrivate, setIsPrivate] = useState(true);
    const [org, setOrg] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(_initialErrorMessage ?? null);
    const [successUrl, setSuccessUrl] = useState<string | null>(_initialSuccessUrl ?? null);

    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      return () => {
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      };
    }, []);

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      if (loading) return;

      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      setErrorMessage(null);
      setLoading(true);

      try {
        const result = await initRemoteRepository({
          repositoryId,
          name: name.trim(),
          isPrivate,
          org: org.trim() || undefined,
        });

        if ('error' in result) {
          setErrorMessage(result.error);
          errorTimerRef.current = setTimeout(() => setErrorMessage(null), ERROR_CLEAR_MS);
        } else {
          setSuccessUrl(result.repoUrl.replace('https://', ''));
          successTimerRef.current = setTimeout(() => setSuccessUrl(null), SUCCESS_DISPLAY_MS);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
        setErrorMessage(msg);
        errorTimerRef.current = setTimeout(() => setErrorMessage(null), ERROR_CLEAR_MS);
      } finally {
        setLoading(false);
      }
    }

    if (successUrl) {
      return (
        <div className="mt-4 border-t pt-4">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Set Up GitHub Remote
          </p>
          <p className="text-sm text-green-600 dark:text-green-400">
            Remote configured: {successUrl}
          </p>
        </div>
      );
    }

    return (
      <div className="mt-4 border-t pt-4">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Set Up GitHub Remote
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="repo-name" className="text-xs">
              Repo name
            </Label>
            <Input
              id="repo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
              className="h-7 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Visibility</Label>
            <RadioGroup
              value={isPrivate ? 'private' : 'public'}
              onValueChange={(v) => setIsPrivate(v === 'private')}
              disabled={loading}
              className="flex gap-4"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="private" id="vis-private" />
                <Label htmlFor="vis-private" className="text-xs font-normal cursor-pointer">
                  Private
                </Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="public" id="vis-public" />
                <Label htmlFor="vis-public" className="text-xs font-normal cursor-pointer">
                  Public
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1">
            <Label htmlFor="repo-org" className="text-xs">
              Org <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="repo-org"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              disabled={loading}
              placeholder="GitHub org (optional)"
              className="h-7 text-xs"
            />
          </div>

          {errorMessage && (
            <p className="text-xs text-destructive">{errorMessage}</p>
          )}

          <Button type="submit" size="sm" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="size-3 animate-spin mr-1" />
                Initialising…
              </>
            ) : (
              'Init Remote'
            )}
          </Button>
        </form>
      </div>
    );
  }
  ```

- [ ] **Step 2: Typecheck**

  ```bash
  pnpm validate
  ```

  Expected: no errors. If `RadioGroup`/`RadioGroupItem` are missing from shadcn, run:
  ```bash
  cd src/presentation/web && pnpm dlx shadcn@latest add radio-group
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/presentation/web/components/common/repository-node/init-remote-section.tsx
  git commit -m "feat(web): add InitRemoteSection form component"
  ```

---

## Task 7: Add `CloudOff` badge to `repository-node.tsx`

**Files:**
- Modify: `src/presentation/web/components/common/repository-node/repository-node.tsx`

- [ ] **Step 1: Add `CloudOff` import**

  Find the lucide-react import line in `repository-node.tsx` and add `CloudOff` to it.

- [ ] **Step 2: Add the badge in the action buttons row**

  Find the section in Row 1 that renders the action buttons (IDE, Shell, Folder, Sessions). After the existing buttons (or before the Sessions dropdown), add:

  ```tsx
  {data.gitInfoStatus === 'ready' && data.hasRemote === false && (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => data.onClick?.()}
          className="text-muted-foreground rounded-full p-0.5 hover:text-orange-500 transition-colors cursor-pointer"
          aria-label="Set up GitHub remote"
        >
          <CloudOff className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Set up GitHub remote</TooltipContent>
    </Tooltip>
  )}
  ```

  `data.onClick?.()` uses optional chaining — `onClick` is always injected in production via `derive-graph.ts` but may be absent in Storybook previews.

- [ ] **Step 3: Validate**

  ```bash
  pnpm validate
  ```

  Expected: no type errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/presentation/web/components/common/repository-node/repository-node.tsx
  git commit -m "feat(web): add CloudOff badge to repository node when hasRemote is false"
  ```

---

## Task 8: Integrate `InitRemoteSection` into both drawers

**Files:**
- Modify: `src/presentation/web/components/common/repository-node/repository-drawer.tsx`
- Modify: `src/presentation/web/components/common/control-center-drawer/repository-drawer-client.tsx`

The render condition for both drawers:
```tsx
{data.gitInfoStatus === 'ready' && data.hasRemote === false && !!data.repositoryPath && !!data.id && (
  <InitRemoteSection repositoryId={data.id} repositoryPath={data.repositoryPath} />
)}
```

- [ ] **Step 1: Update `repository-drawer.tsx`**

  Add the `InitRemoteSection` import at the top:
  ```typescript
  import { InitRemoteSection } from './init-remote-section';
  ```

  In the JSX, after the "OPEN WITH" section (after the `</div>` that wraps the IDE/Shell/Folder buttons), add the conditional render above.

- [ ] **Step 2: Update `repository-drawer-client.tsx`**

  Same import and same conditional render pattern, inserted after the "OPEN WITH" section.

- [ ] **Step 3: Validate**

  ```bash
  pnpm validate
  ```

  Expected: no type errors.

- [ ] **Step 4: Build**

  ```bash
  pnpm build
  ```

  Expected: successful build.

- [ ] **Step 5: Commit**

  ```bash
  git add src/presentation/web/components/common/repository-node/repository-drawer.tsx src/presentation/web/components/common/control-center-drawer/repository-drawer-client.tsx
  git commit -m "feat(web): render InitRemoteSection in repository drawers"
  ```

---

## Task 9: Storybook mock + story variants

**Files:**
- Create: `.storybook/mocks/app/actions/init-remote-repository.ts`
- Modify: `src/presentation/web/components/common/repository-node/repository-drawer.stories.tsx`

- [ ] **Step 1: Create the Storybook mock**

  Create `.storybook/mocks/app/actions/init-remote-repository.ts`:

  ```typescript
  export const initRemoteRepository = async () => ({
    repoUrl: 'https://github.com/example/repo',
  });
  ```

- [ ] **Step 2: Add story variants to `repository-drawer.stories.tsx`**

  First read the existing `repository-drawer.stories.tsx` file to understand the `DrawerTrigger`/`RepositoryDrawerShellTemplate` wrapper pattern. Then add these 5 exports following the exact same pattern used by existing stories.

  The key data shapes to pass:

  **`HasNoRemote`** — shows form in idle state:
  ```typescript
  // data: { gitInfoStatus: 'ready', hasRemote: false, id: 'repo-1', repositoryPath: '/home/user/my-project', ... }
  ```

  **`HasRemote`** — form is hidden:
  ```typescript
  // data: { gitInfoStatus: 'ready', hasRemote: true, ... }
  ```

  **`InitRemoteError`** — pre-seeded error via `_initialErrorMessage` on `InitRemoteSection`:

  Since the drawer renders `InitRemoteSection` conditionally, the `_initialErrorMessage` prop must be passed through. If the drawer doesn't accept it as a prop, wrap the drawer in a story-level client component that renders `InitRemoteSection` directly:

  ```typescript
  export const InitRemoteError: Story = {
    render: () => (
      <RepositoryDrawerShellTemplate>
        <InitRemoteSection
          repositoryId="repo-1"
          repositoryPath="/home/user/my-project"
          _initialErrorMessage="gh CLI not found. Install with: brew install gh"
        />
      </RepositoryDrawerShellTemplate>
    ),
  };
  ```

  **`InitRemoteSuccess`** — pre-seeded success via `_initialSuccessUrl`:
  ```typescript
  export const InitRemoteSuccess: Story = {
    render: () => (
      <RepositoryDrawerShellTemplate>
        <InitRemoteSection
          repositoryId="repo-1"
          repositoryPath="/home/user/my-project"
          _initialSuccessUrl="github.com/example/my-project"
        />
      </RepositoryDrawerShellTemplate>
    ),
  };
  ```

  **`InitRemoteLoading`** — loading state is transient; use an `InitRemoteSection` wrapper that intercepts the server action and never resolves:
  ```typescript
  // In the story file (after existing imports), add a wrapper component:
  function LoadingInitRemoteSection(props: Omit<InitRemoteSectionProps, '_initialErrorMessage' | '_initialSuccessUrl'>) {
    // The Storybook mock always returns a result; to freeze in loading state,
    // render InitRemoteSection and rely on the form's loading UI which shows after submit.
    // Alternative: use a div with the same loading markup directly.
    return (
      <div className="mt-4 border-t pt-4">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Set Up GitHub Remote
        </p>
        <div className="space-y-3 opacity-50 pointer-events-none">
          <div className="h-7 bg-muted rounded animate-pulse" />
          <div className="h-7 bg-muted rounded animate-pulse" />
          <div className="h-7 bg-muted rounded animate-pulse" />
          <div className="h-8 bg-primary/30 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  export const InitRemoteLoading: Story = {
    render: () => (
      <RepositoryDrawerShellTemplate>
        <LoadingInitRemoteSection repositoryId="repo-1" repositoryPath="/home/user/my-project" />
      </RepositoryDrawerShellTemplate>
    ),
  };
  ```

  > Adapt the `RepositoryDrawerShellTemplate` usage to match exactly what the existing stories use. The pattern above uses direct `InitRemoteSection` rendering for error/success/loading states — this is cleaner than threading props through the full drawer and avoids adding test-only props to `RepositoryDrawer`.

- [ ] **Step 3: Verify Storybook build**

  ```bash
  pnpm build:storybook 2>&1 | tail -20
  ```

  Expected: successful build, no missing module errors for `init-remote-repository`.

- [ ] **Step 4: Run full test + validate**

  ```bash
  pnpm validate && pnpm test:unit
  ```

  Expected: zero failures.

- [ ] **Step 5: Commit**

  ```bash
  git add .storybook/mocks/app/actions/init-remote-repository.ts src/presentation/web/components/common/repository-node/repository-drawer.stories.tsx
  git commit -m "feat(web): add storybook mock and story variants for github remote init ui"
  ```

---

## Final Verification

- [ ] **Run full test suite**

  ```bash
  pnpm test
  ```

  Expected: all tests pass, zero failures.

- [ ] **Build**

  ```bash
  pnpm build
  ```

  Expected: successful build.

- [ ] **Validate**

  ```bash
  pnpm validate
  ```

  Expected: no lint/type errors.
