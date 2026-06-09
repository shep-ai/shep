# Per-Repository Webhook Toggle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to toggle GitHub webhook registration per repository from the repo node and drawer UI.

**Architecture:** New public methods on `GitHubWebhookService` and `WebhookManagerService` for single-repo webhook CRUD. Three new Next.js API routes expose these. A `useWebhookAction` hook provides optimistic toggle state to both the repo node action button and drawer section.

**Tech Stack:** TypeScript, Next.js API routes, React hooks, lucide-react icons, Storybook, Vitest

**Spec:** `docs/superpowers/specs/2026-03-16-per-repo-webhook-toggle-design.md`

---

## Chunk 1: Service Layer

### Task 1: Add `registerWebhookForSingleRepo` and `removeWebhookForRepo` to GitHubWebhookService

**Files:**

- Modify: `packages/core/src/infrastructure/services/webhook/github-webhook.service.ts`
- Create: `packages/core/src/infrastructure/services/webhook/github-webhook.service.test.ts`

**Context:** The existing `registerWebhookForRepo()` is private and called from `registerWebhooks()` (bulk). We need to expose single-repo registration as a new public method with a duplicate guard, and add a method to remove a single repo's webhook. All path comparisons must normalize to forward slashes.

- [ ] **Step 1: Write failing tests for `registerWebhookForSingleRepo`**

Create the test file. Test three scenarios: (a) registers a webhook for a new repo, (b) no-ops when repo already has a webhook, (c) normalizes paths before comparing.

```typescript
// packages/core/src/infrastructure/services/webhook/github-webhook.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubWebhookService, type ExecFunction } from './github-webhook.service.js';

// Minimal mocks for constructor dependencies
const mockFeatureRepo = { list: vi.fn().mockResolvedValue([]) } as any;
const mockGitPrService = {
  getRemoteUrl: vi.fn().mockResolvedValue('https://github.com/owner/repo.git'),
} as any;
const mockNotificationService = { notify: vi.fn() } as any;

function createService(execFn?: ExecFunction) {
  const exec =
    execFn ??
    vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ id: 42 }),
      stderr: '',
    });
  return {
    service: new GitHubWebhookService(
      mockFeatureRepo,
      mockGitPrService,
      mockNotificationService,
      exec as ExecFunction
    ),
    exec,
  };
}

describe('GitHubWebhookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerWebhookForSingleRepo', () => {
    it('registers a webhook and adds it to the registered list', async () => {
      const { service, exec } = createService();
      await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      expect(exec).toHaveBeenCalled();
      expect(service.getRegisteredWebhooks()).toHaveLength(1);
      expect(service.getRegisteredWebhooks()[0].repoFullName).toBe('owner/repo');
    });

    it('no-ops when a webhook is already registered for the repo path', async () => {
      const { service, exec } = createService();
      await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      // exec is called for stale cleanup (list hooks) + create — only once for registration
      expect(service.getRegisteredWebhooks()).toHaveLength(1);
    });

    it('normalizes backslash paths before comparing', async () => {
      const { service } = createService();
      await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      // Same path with backslashes (Windows)
      await service.registerWebhookForSingleRepo(
        '\\home\\user\\repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      expect(service.getRegisteredWebhooks()).toHaveLength(1);
    });
  });

  describe('removeWebhookForRepo', () => {
    it('removes a webhook from GitHub and the registered list', async () => {
      const { service, exec } = createService();
      await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      expect(service.getRegisteredWebhooks()).toHaveLength(1);

      await service.removeWebhookForRepo('/home/user/repo');
      expect(service.getRegisteredWebhooks()).toHaveLength(0);
      // Verify DELETE was called
      const deleteCalls = (exec as any).mock.calls.filter((c: string[][]) =>
        c[1]?.includes('DELETE')
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
    });

    it('no-ops when repo path is not found', async () => {
      const { service, exec } = createService();
      await service.removeWebhookForRepo('/nonexistent/path');
      // No DELETE calls
      const deleteCalls = (exec as any).mock.calls.filter((c: string[][]) =>
        c[1]?.includes('DELETE')
      );
      expect(deleteCalls).toHaveLength(0);
    });

    it('normalizes paths when finding webhook to remove', async () => {
      const { service } = createService();
      await service.registerWebhookForSingleRepo(
        '/home/user/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
      await service.removeWebhookForRepo('\\home\\user\\repo');
      expect(service.getRegisteredWebhooks()).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/src/infrastructure/services/webhook/github-webhook.service.test.ts`
Expected: FAIL — `registerWebhookForSingleRepo` and `removeWebhookForRepo` do not exist.

- [ ] **Step 3: Implement `registerWebhookForSingleRepo` and `removeWebhookForRepo`**

In `github-webhook.service.ts`, add a helper function at the top of the file:

```typescript
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}
```

Add two new public methods to `GitHubWebhookService`:

```typescript
/**
 * Register a webhook for a single repository.
 * No-ops if the repo already has a registered webhook (normalized path comparison).
 */
async registerWebhookForSingleRepo(repoPath: string, webhookUrl: string): Promise<RegisteredWebhook | null> {
  const normalized = normalizePath(repoPath);
  const existing = this.registeredWebhooks.find(
    (w) => normalizePath(w.repositoryPath) === normalized
  );
  if (existing) return existing;

  await this.registerWebhookForRepo(repoPath, webhookUrl);

  // Return the newly registered webhook (last entry if registration succeeded)
  const added = this.registeredWebhooks.find(
    (w) => normalizePath(w.repositoryPath) === normalized
  );
  return added ?? null;
}

/**
 * Remove the webhook for a single repository.
 * No-ops if the repo has no registered webhook.
 */
async removeWebhookForRepo(repoPath: string): Promise<void> {
  const normalized = normalizePath(repoPath);
  const index = this.registeredWebhooks.findIndex(
    (w) => normalizePath(w.repositoryPath) === normalized
  );
  if (index === -1) return;

  const webhook = this.registeredWebhooks[index];

  try {
    await this.execFn(
      'gh',
      [
        'api',
        '--method',
        'DELETE',
        `-H`,
        'Accept: application/vnd.github+json',
        `/repos/${webhook.repoFullName}/hooks/${webhook.webhookId}`,
      ],
      { cwd: webhook.repositoryPath }
    );
    // eslint-disable-next-line no-console
    console.log(`${TAG} Removed webhook #${webhook.webhookId} for ${webhook.repoFullName}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn(`${TAG} Failed to remove webhook for ${webhook.repoFullName}: ${msg}`);
  }

  this.registeredWebhooks.splice(index, 1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/src/infrastructure/services/webhook/github-webhook.service.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/infrastructure/services/webhook/github-webhook.service.ts packages/core/src/infrastructure/services/webhook/github-webhook.service.test.ts
git commit -m "feat(web): add single-repo webhook register and remove methods"
```

---

### Task 2: Add `enableWebhookForRepo`, `disableWebhookForRepo`, `isWebhookEnabledForRepo` to WebhookManagerService

**Files:**

- Modify: `packages/core/src/infrastructure/services/webhook/webhook-manager.service.ts`
- Create: `packages/core/src/infrastructure/services/webhook/webhook-manager.service.test.ts`

**Context:** The manager orchestrates tunnel + webhook service. New methods delegate to `GitHubWebhookService` concrete methods (cast from `IWebhookService`, same pattern as `getStatus()`). `enableWebhookForRepo` must validate the tunnel is running and construct the webhook URL.

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/src/infrastructure/services/webhook/webhook-manager.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookManagerService } from './webhook-manager.service.js';

function createMocks({ tunnelRunning = true, tunnelUrl = 'https://tunnel.example.com' } = {}) {
  const tunnelService = {
    start: vi.fn().mockResolvedValue(tunnelUrl),
    stop: vi.fn().mockResolvedValue(undefined),
    getPublicUrl: vi.fn().mockReturnValue(tunnelRunning ? tunnelUrl : null),
    onUrlChange: vi.fn(),
    isRunning: vi.fn().mockReturnValue(tunnelRunning),
  };

  const webhookService = {
    registerWebhooks: vi.fn().mockResolvedValue(undefined),
    updateWebhookUrl: vi.fn().mockResolvedValue(undefined),
    removeWebhooks: vi.fn().mockResolvedValue(undefined),
    validateSignature: vi.fn().mockReturnValue({ valid: true }),
    handleEvent: vi.fn().mockResolvedValue(undefined),
    // Concrete GitHubWebhookService methods
    registerWebhookForSingleRepo: vi
      .fn()
      .mockResolvedValue({ repoFullName: 'owner/repo', webhookId: 42, repositoryPath: '/repo' }),
    removeWebhookForRepo: vi.fn().mockResolvedValue(undefined),
    getRegisteredWebhooks: vi.fn().mockReturnValue([]),
    getDeliveryHistory: vi.fn().mockReturnValue([]),
  };

  return { tunnelService, webhookService };
}

describe('WebhookManagerService', () => {
  describe('enableWebhookForRepo', () => {
    it('returns error when tunnel is not running', async () => {
      const { tunnelService, webhookService } = createMocks({ tunnelRunning: false });
      const manager = new WebhookManagerService(tunnelService, webhookService);

      const result = await manager.enableWebhookForRepo('/repo');
      expect(result).toEqual({ success: false, error: 'tunnel_not_connected' });
      expect(webhookService.registerWebhookForSingleRepo).not.toHaveBeenCalled();
    });

    it('registers webhook and returns success when tunnel is running', async () => {
      const { tunnelService, webhookService } = createMocks();
      const manager = new WebhookManagerService(tunnelService, webhookService);

      const result = await manager.enableWebhookForRepo('/repo');
      expect(result.success).toBe(true);
      expect(result.webhook).toBeDefined();
      expect(webhookService.registerWebhookForSingleRepo).toHaveBeenCalledWith(
        '/repo',
        'https://tunnel.example.com/api/webhooks/github'
      );
    });
  });

  describe('disableWebhookForRepo', () => {
    it('delegates to webhookService.removeWebhookForRepo', async () => {
      const { tunnelService, webhookService } = createMocks();
      const manager = new WebhookManagerService(tunnelService, webhookService);

      const result = await manager.disableWebhookForRepo('/repo');
      expect(result).toEqual({ success: true });
      expect(webhookService.removeWebhookForRepo).toHaveBeenCalledWith('/repo');
    });
  });

  describe('isWebhookEnabledForRepo', () => {
    it('returns false when repo has no webhook', () => {
      const { tunnelService, webhookService } = createMocks();
      const manager = new WebhookManagerService(tunnelService, webhookService);

      expect(manager.isWebhookEnabledForRepo('/repo')).toBe(false);
    });

    it('returns true when repo has a webhook (normalized path)', () => {
      const { tunnelService, webhookService } = createMocks();
      webhookService.getRegisteredWebhooks.mockReturnValue([
        { repoFullName: 'owner/repo', webhookId: 42, repositoryPath: '/home/user/repo' },
      ]);
      const manager = new WebhookManagerService(tunnelService, webhookService);

      expect(manager.isWebhookEnabledForRepo('/home/user/repo')).toBe(true);
      expect(manager.isWebhookEnabledForRepo('\\home\\user\\repo')).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/src/infrastructure/services/webhook/webhook-manager.service.test.ts`
Expected: FAIL — methods do not exist.

- [ ] **Step 3: Implement the three methods**

In `webhook-manager.service.ts`, add a `normalizePath` helper at the top:

```typescript
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}
```

Add an interface for the enable result (above the class):

```typescript
export interface WebhookRepoResult {
  success: boolean;
  webhook?: RegisteredWebhook;
  error?: string;
}
```

Add three public methods to `WebhookManagerService`:

```typescript
async enableWebhookForRepo(repoPath: string): Promise<WebhookRepoResult> {
  if (!this.tunnelService.isRunning() || !this.tunnelService.getPublicUrl()) {
    return { success: false, error: 'tunnel_not_connected' };
  }

  const webhookUrl = `${this.tunnelService.getPublicUrl()}/api/webhooks/github`;
  const ghService = this.webhookService as GitHubWebhookService;

  try {
    const webhook = await ghService.registerWebhookForSingleRepo(repoPath, webhookUrl);
    return { success: true, webhook: webhook ?? undefined };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

async disableWebhookForRepo(repoPath: string): Promise<{ success: boolean; error?: string }> {
  const ghService = this.webhookService as GitHubWebhookService;

  try {
    await ghService.removeWebhookForRepo(repoPath);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

isWebhookEnabledForRepo(repoPath: string): boolean {
  const ghService = this.webhookService as GitHubWebhookService;
  const registered = typeof ghService.getRegisteredWebhooks === 'function'
    ? ghService.getRegisteredWebhooks()
    : [];
  const normalized = normalizePath(repoPath);
  return registered.some((w) => normalizePath(w.repositoryPath) === normalized);
}
```

Also export `WebhookRepoResult` from the module.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/src/infrastructure/services/webhook/webhook-manager.service.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/infrastructure/services/webhook/webhook-manager.service.ts packages/core/src/infrastructure/services/webhook/webhook-manager.service.test.ts
git commit -m "feat(web): add per-repo enable disable and status methods to webhook manager"
```

---

## Chunk 2: API Routes

### Task 3: Create `/api/webhooks/repos/status` endpoint

**Files:**

- Create: `src/presentation/web/app/api/webhooks/repos/status/route.ts`

**Context:** Follow the pattern from `src/presentation/web/app/api/webhooks/status/route.ts`. The endpoint takes `repositoryPath` as a query param and checks the webhook manager's `isWebhookEnabledForRepo()`.

- [ ] **Step 1: Create the route handler**

```typescript
// src/presentation/web/app/api/webhooks/repos/status/route.ts
/**
 * Per-Repo Webhook Status: GET /api/webhooks/repos/status?repositoryPath=...
 *
 * Returns whether a webhook is enabled for a specific repository.
 */

import {
  hasWebhookManager,
  getWebhookManager,
} from '@shepai/core/infrastructure/services/webhook/webhook-manager.service';
import type { GitHubWebhookService } from '@shepai/core/infrastructure/services/webhook/github-webhook.service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const repositoryPath = searchParams.get('repositoryPath');

  if (!repositoryPath) {
    return Response.json({ error: 'repositoryPath query parameter is required' }, { status: 400 });
  }

  if (!hasWebhookManager()) {
    return Response.json({ enabled: false });
  }

  const manager = getWebhookManager();
  const enabled = manager.isWebhookEnabledForRepo(repositoryPath);

  if (!enabled) {
    return Response.json({ enabled: false });
  }

  // Find the specific webhook details
  const ghService = (manager as any).webhookService as GitHubWebhookService;
  const normalized = repositoryPath.replace(/\\/g, '/');
  const webhook = ghService
    .getRegisteredWebhooks()
    .find((w) => w.repositoryPath.replace(/\\/g, '/') === normalized);

  return Response.json({
    enabled: true,
    webhookId: webhook?.webhookId,
    repoFullName: webhook?.repoFullName,
  });
}
```

- [ ] **Step 2: Verify the route compiles**

Run: `pnpm tsc --noEmit --project src/presentation/web/tsconfig.json 2>&1 | head -20`
Expected: No type errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/web/app/api/webhooks/repos/status/route.ts
git commit -m "feat(web): add per-repo webhook status api endpoint"
```

---

### Task 4: Create `/api/webhooks/repos/enable` endpoint

**Files:**

- Create: `src/presentation/web/app/api/webhooks/repos/enable/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
// src/presentation/web/app/api/webhooks/repos/enable/route.ts
/**
 * Enable Webhook for Repo: POST /api/webhooks/repos/enable
 *
 * Body: { repositoryPath: string }
 * Registers a GitHub webhook for the given repository.
 */

import {
  hasWebhookManager,
  getWebhookManager,
} from '@shepai/core/infrastructure/services/webhook/webhook-manager.service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: { repositoryPath?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { repositoryPath } = body;
  if (!repositoryPath) {
    return Response.json({ success: false, error: 'repositoryPath is required' }, { status: 400 });
  }

  if (!hasWebhookManager()) {
    return Response.json(
      { success: false, error: 'Webhook system not initialized' },
      { status: 503 }
    );
  }

  const manager = getWebhookManager();
  const result = await manager.enableWebhookForRepo(repositoryPath);
  return Response.json(result, { status: result.success ? 200 : 422 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/presentation/web/app/api/webhooks/repos/enable/route.ts
git commit -m "feat(web): add enable webhook api endpoint"
```

---

### Task 5: Create `/api/webhooks/repos/disable` endpoint

**Files:**

- Create: `src/presentation/web/app/api/webhooks/repos/disable/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
// src/presentation/web/app/api/webhooks/repos/disable/route.ts
/**
 * Disable Webhook for Repo: POST /api/webhooks/repos/disable
 *
 * Body: { repositoryPath: string }
 * Removes the GitHub webhook for the given repository.
 */

import {
  hasWebhookManager,
  getWebhookManager,
} from '@shepai/core/infrastructure/services/webhook/webhook-manager.service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let body: { repositoryPath?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { repositoryPath } = body;
  if (!repositoryPath) {
    return Response.json({ success: false, error: 'repositoryPath is required' }, { status: 400 });
  }

  if (!hasWebhookManager()) {
    return Response.json(
      { success: false, error: 'Webhook system not initialized' },
      { status: 503 }
    );
  }

  const manager = getWebhookManager();
  const result = await manager.disableWebhookForRepo(repositoryPath);
  return Response.json(result);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/presentation/web/app/api/webhooks/repos/disable/route.ts
git commit -m "feat(web): add disable webhook api endpoint"
```

---

## Chunk 3: UI Hook

### Task 6: Create `useWebhookAction` hook

**Files:**

- Create: `src/presentation/web/hooks/use-webhook-action.ts`

**Context:** Follow the `useRepositoryActions` pattern (error auto-clear after 5s) and `useDeployAction` pattern (mounted ref, cleanup). Fetches both tunnel status and per-repo webhook status on mount. Provides optimistic toggle with rollback.

- [ ] **Step 1: Create the hook**

```typescript
// src/presentation/web/hooks/use-webhook-action.ts
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface WebhookActionState {
  toggle: () => Promise<void>;
  enabled: boolean;
  loading: boolean;
  error: string | null;
  tunnelConnected: boolean;
  webhookId: number | undefined;
  repoFullName: string | undefined;
  initializing: boolean;
}

const ERROR_CLEAR_DELAY = 5000;

export function useWebhookAction(repositoryPath: string | null): WebhookActionState {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tunnelConnected, setTunnelConnected] = useState(false);
  const [webhookId, setWebhookId] = useState<number | undefined>();
  const [repoFullName, setRepoFullName] = useState<string | undefined>();
  const [initializing, setInitializing] = useState(true);

  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // Fetch initial status on mount
  useEffect(() => {
    if (!repositoryPath) {
      setInitializing(false);
      return;
    }

    let cancelled = false;

    async function fetchStatus() {
      try {
        const [tunnelRes, repoRes] = await Promise.all([
          fetch('/api/webhooks/status'),
          fetch(`/api/webhooks/repos/status?repositoryPath=${encodeURIComponent(repositoryPath!)}`),
        ]);

        if (cancelled || !mountedRef.current) return;

        const tunnelData = await tunnelRes.json();
        const repoData = await repoRes.json();

        if (cancelled || !mountedRef.current) return;

        setTunnelConnected(tunnelData.tunnel?.connected ?? false);
        setEnabled(repoData.enabled ?? false);
        setWebhookId(repoData.webhookId);
        setRepoFullName(repoData.repoFullName);
      } catch {
        // Silently fail — UI will show default disabled state
      } finally {
        if (!cancelled && mountedRef.current) {
          setInitializing(false);
        }
      }
    }

    void fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [repositoryPath]);

  const handleToggle = useCallback(async () => {
    if (!repositoryPath || loading) return;

    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);

    const wasEnabled = enabled;
    const endpoint = wasEnabled ? '/api/webhooks/repos/disable' : '/api/webhooks/repos/enable';

    // Optimistic update
    setEnabled(!wasEnabled);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryPath }),
      });

      if (!mountedRef.current) return;

      const data = await res.json();

      if (!data.success) {
        // Rollback
        setEnabled(wasEnabled);
        const errorMsg = data.error ?? 'An unexpected error occurred';
        setError(errorMsg);
        errorTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setError(null);
        }, ERROR_CLEAR_DELAY);
      } else {
        // Update details from server response
        if (!wasEnabled && data.webhook) {
          setWebhookId(data.webhook.webhookId);
          setRepoFullName(data.webhook.repoFullName);
        } else if (wasEnabled) {
          setWebhookId(undefined);
          setRepoFullName(undefined);
        }
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      // Rollback
      setEnabled(wasEnabled);
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMsg);
      errorTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setError(null);
      }, ERROR_CLEAR_DELAY);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [repositoryPath, loading, enabled]);

  return {
    toggle: handleToggle,
    enabled,
    loading,
    error,
    tunnelConnected,
    webhookId,
    repoFullName,
    initializing,
  };
}
```

- [ ] **Step 2: Verify no type errors**

Run: `pnpm tsc --noEmit --project src/presentation/web/tsconfig.json 2>&1 | head -20`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/web/hooks/use-webhook-action.ts
git commit -m "feat(web): add use-webhook-action hook with optimistic toggle"
```

---

## Chunk 4: UI Components

### Task 7: Add webhook action button to RepositoryNode

**Files:**

- Modify: `src/presentation/web/components/common/repository-node/repository-node.tsx`

**Context:** Add a `Radio` icon button in the action row between `FolderOpen` and `FeatureSessionsDropdown`. Use the `useWebhookAction` hook. When `tunnelConnected` is false, the button is disabled. When `enabled` is true, the icon is green. Use existing `ActionButton` + `TooltipProvider` pattern from the adjacent buttons.

- [ ] **Step 1: Add the webhook button to the node**

In `repository-node.tsx`:

1. Add imports:

```typescript
import { Radio } from 'lucide-react';
import { useWebhookAction } from '@/hooks/use-webhook-action';
```

2. Inside the `RepositoryNode` function, add the hook call after `useRepositoryActions`:

```typescript
const webhookAction = useWebhookAction(data.repositoryPath ?? null);
```

3. After the `FolderOpen` `TooltipProvider` block (line ~233) and before `FeatureSessionsDropdown` (line ~234), insert:

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="flex items-center">
        <ActionButton
          label={
            !webhookAction.tunnelConnected
              ? 'Webhook unavailable — tunnel not running'
              : webhookAction.enabled
                ? 'Disable webhook'
                : 'Enable webhook'
          }
          onClick={webhookAction.toggle}
          loading={webhookAction.loading}
          error={!!webhookAction.error}
          icon={Radio}
          iconOnly
          variant="ghost"
          size="icon-xs"
          disabled={!webhookAction.tunnelConnected}
          className={
            webhookAction.enabled && !webhookAction.error
              ? 'text-green-500 hover:text-green-600'
              : undefined
          }
        />
      </span>
    </TooltipTrigger>
    <TooltipContent>
      {!webhookAction.tunnelConnected
        ? 'Webhook unavailable — tunnel not running'
        : webhookAction.enabled
          ? 'Disable webhook'
          : 'Enable webhook'}
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**Note:** The `ActionButton` component does not currently accept `disabled` or `className` props. Check if these need to be added. If `ActionButton` doesn't support `disabled`, pass it through by adding `disabled?: boolean` and `className?: string` to `ActionButtonProps` and forwarding them to the `<Button>` element. The `disabled` should combine with the existing `loading` check: `disabled={loading || disabled}`. The `className` should be merged with `cn()`.

- [ ] **Step 2: Update `ActionButton` if needed**

Check if `ActionButton` already supports `disabled` and `className` props. If not, modify `src/presentation/web/components/common/action-button/action-button.tsx`:

Add to `ActionButtonProps`:

```typescript
/** Extra CSS classes for the button */
className?: string;
/** Explicitly disable the button (in addition to loading state) */
disabled?: boolean;
```

Update the destructuring and `<Button>`:

```typescript
export function ActionButton({
  label,
  onClick,
  loading,
  error,
  icon: Icon,
  iconOnly = false,
  variant = 'outline',
  size = 'sm',
  className: extraClassName,
  disabled,
}: ActionButtonProps) {
  // ...
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      disabled={loading || disabled}
      onClick={handleClick}
      className={cn(
        'gap-1.5',
        error && 'text-destructive hover:text-destructive',
        !error &&
          iconOnly &&
          variant === 'ghost' &&
          'text-muted-foreground cursor-pointer rounded-full transition-colors hover:text-blue-500',
        extraClassName
      )}
    >
```

- [ ] **Step 3: Verify no type errors and the button renders**

Run: `pnpm tsc --noEmit --project src/presentation/web/tsconfig.json 2>&1 | head -20`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/web/components/common/repository-node/repository-node.tsx src/presentation/web/components/common/action-button/action-button.tsx
git commit -m "feat(web): add webhook toggle button to repository node"
```

---

### Task 8: Add webhook section to RepositoryDrawer

**Files:**

- Modify: `src/presentation/web/components/common/repository-node/repository-drawer.tsx`

**Context:** Add a "WEBHOOKS" section below "OPEN WITH", following the same layout pattern (Separator + section with heading). Use `useWebhookAction` hook. Show ActionButton with label + detail badges when enabled.

- [ ] **Step 1: Update the drawer**

In `repository-drawer.tsx`:

1. Add imports:

```typescript
import { Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useWebhookAction } from '@/hooks/use-webhook-action';
```

2. Inside the component, add the hook:

```typescript
const webhookAction = useWebhookAction(data?.repositoryPath ?? null);
```

3. After the closing `</div>` of the "OPEN WITH" section (before `</>`) add:

```tsx
<Separator />
<div className="flex flex-col gap-3 p-4">
  <div className="text-muted-foreground text-xs font-semibold tracking-wider">
    WEBHOOKS
  </div>
  <div className="flex flex-col gap-2">
    <ActionButton
      label={
        !webhookAction.tunnelConnected
          ? 'Webhook unavailable — tunnel not running'
          : webhookAction.enabled
            ? 'Disable Webhook'
            : 'Enable Webhook'
      }
      onClick={webhookAction.toggle}
      loading={webhookAction.loading}
      error={!!webhookAction.error}
      icon={Radio}
      variant="outline"
      size="sm"
      disabled={!webhookAction.tunnelConnected}
      className={webhookAction.enabled && !webhookAction.error ? 'text-green-500 border-green-500/30 hover:text-green-600' : undefined}
    />
    {webhookAction.enabled && webhookAction.webhookId ? (
      <div className="flex flex-col gap-2">
        <div className="text-muted-foreground text-xs">
          Webhook #{webhookAction.webhookId}
          {webhookAction.repoFullName ? ` on ${webhookAction.repoFullName}` : ''}
        </div>
        <div className="flex flex-wrap gap-1">
          {['pull_request', 'check_suite', 'check_run'].map((event) => (
            <Badge key={event} variant="secondary" className="text-xs">
              {event}
            </Badge>
          ))}
        </div>
      </div>
    ) : null}
  </div>
</div>
```

- [ ] **Step 2: Verify no type errors**

Run: `pnpm tsc --noEmit --project src/presentation/web/tsconfig.json 2>&1 | head -20`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/web/components/common/repository-node/repository-drawer.tsx
git commit -m "feat(web): add webhook section to repository drawer"
```

---

## Chunk 5: Storybook Stories

### Task 9: Add Storybook stories for webhook states

**Files:**

- Modify: `src/presentation/web/components/common/repository-node/repository-node.stories.tsx`
- Modify: `src/presentation/web/components/common/repository-node/repository-drawer.stories.tsx`

**Context:** The `useWebhookAction` hook calls `fetch()` internally, so stories need fetch mocks via Storybook's `msw` or parameter-based mocking. However, following the existing pattern in this project (stories use real components with no fetch mocking — they just show the visual states), we should mock at the module level using Storybook's module mock or simply accept that the webhook button will show its default (initializing) state in stories. The simplest approach: stories show the component as-is. The hook will fail to fetch in Storybook (no API server) and default to `enabled: false, tunnelConnected: false` — which shows the disabled state. This is acceptable for Storybook since the visual states are visible.

**However**, to show all visual states, we need to add a Storybook mock for the fetch calls. Check if the project uses msw or a custom mock pattern for Storybook. If not, the stories just show the default disabled state, which is fine for now.

- [ ] **Step 1: Add webhook-related stories to repository-node.stories.tsx**

Add a story `WithWebhookButton` that shows the node with `repositoryPath` set (which enables the webhook button):

```typescript
export const WithWebhookButton: Story = {
  args: {
    repositoryPath: '/home/user/shep-ai/cli',
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};
```

This is essentially the same as `WithActions` but explicitly named for webhook visibility. The existing `WithActions` story already shows the button since it has `repositoryPath`.

- [ ] **Step 2: Add webhook stories to repository-drawer.stories.tsx**

Add a story showing the drawer with the webhook section:

```typescript
export const WithWebhookSection: Story = {
  render: () => <RepositoryDrawerShellTemplate data={repoData} />,
};
```

Again, the existing `Default`/`InDrawer` stories already show this since `repoData` has `repositoryPath`. Add the explicit story for documentation.

- [ ] **Step 3: Verify Storybook builds**

Run: `pnpm storybook build 2>&1 | tail -5` (or just typecheck)
Expected: No build errors.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/web/components/common/repository-node/repository-node.stories.tsx src/presentation/web/components/common/repository-node/repository-drawer.stories.tsx
git commit -m "feat(web): add storybook stories for webhook toggle states"
```

---

## Chunk 6: Validation

### Task 10: Run full validation

- [ ] **Step 1: Run lint and typecheck**

Run: `pnpm validate`
Expected: All checks pass.

- [ ] **Step 2: Run unit tests**

Run: `pnpm test:unit`
Expected: All tests pass, including the new webhook service tests.

- [ ] **Step 3: Fix any issues found**

Address lint errors, type errors, or test failures.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(web): address validation issues in webhook toggle feature"
```
