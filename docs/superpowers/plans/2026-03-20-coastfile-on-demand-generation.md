# Coastfile On-Demand Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Coastfile generation from auto-generating during dev server startup to on-demand via `shep coasts init` CLI command and a web UI button on the repository node.

**Architecture:** The existing `CoastsService.generateCoastfile()` and `build()` methods are unchanged. We rewire the trigger points: dev server throws on missing Coastfile instead of auto-generating, a new CLI command and server action call the existing service methods on demand.

**Tech Stack:** Commander.js (CLI), Next.js server actions (web), Vitest (tests), React/lucide-react (UI)

---

### Task 1: Update dev server to fail on missing Coastfile

**Files:**
- Modify: `src/presentation/web/coasts-dev-server.ts:46-52`
- Modify: `tests/unit/presentation/web/coasts-dev-server.test.ts:155-198`
- Modify: `tests/unit/presentation/dev-server-coasts.test.ts:102-123`

- [ ] **Step 1: Update the failing tests in coasts-dev-server.test.ts**

Replace the test at line 155 ("calls generateCoastfile when no Coastfile exists") with a test that expects a throw:

```typescript
it('throws with helpful error when no Coastfile exists', async () => {
  const service = createMockCoastsService();
  vi.mocked(service.checkPrerequisites).mockResolvedValue(allPrerequisitesMet());
  vi.mocked(service.hasCoastfile).mockResolvedValue(false);

  await expect(startCoastsDevServer(service, workDir)).rejects.toThrow(
    /no coastfile found/i
  );

  // Should not proceed to build or run
  expect(service.build).not.toHaveBeenCalled();
  expect(service.run).not.toHaveBeenCalled();
  // Should NOT call generateCoastfile
  expect(service.generateCoastfile).not.toHaveBeenCalled();
});
```

Replace the test at line 171 ("logs Coastfile generation progress") with:

```typescript
it('includes both CLI and web UI instructions in missing Coastfile error', async () => {
  const service = createMockCoastsService();
  vi.mocked(service.checkPrerequisites).mockResolvedValue(allPrerequisitesMet());
  vi.mocked(service.hasCoastfile).mockResolvedValue(false);

  const error = await startCoastsDevServer(service, workDir).catch((e: Error) => e);
  expect(error.message).toMatch(/shep coasts init/);
  expect(error.message).toMatch(/Generate Coastfile/);
});
```

Remove the test at line 185 ("throws when Coastfile generation fails") — no longer applicable.

- [ ] **Step 2: Update the failing tests in dev-server-coasts.test.ts**

Replace test at line 102 ("calls generateCoastfile when no Coastfile exists"):

```typescript
it('throws when no Coastfile exists', async () => {
  vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMetResult());
  vi.mocked(mockService.hasCoastfile).mockResolvedValue(false);

  await expect(startCoastsDevServer(mockService, workDir)).rejects.toThrow(
    /no coastfile found/i
  );

  expect(mockService.generateCoastfile).not.toHaveBeenCalled();
  expect(mockService.build).not.toHaveBeenCalled();
});
```

Update test at line 114 ("does not call generateCoastfile when Coastfile exists") — rename to "proceeds with build and run when Coastfile exists" (behavior unchanged, just rename for clarity).

- [ ] **Step 3: Run tests to verify they fail (RED)**

Run: `pnpm test:unit -- --run tests/unit/presentation/web/coasts-dev-server.test.ts tests/unit/presentation/dev-server-coasts.test.ts`
Expected: FAIL — tests expect throw but implementation still auto-generates.

- [ ] **Step 4: Update coasts-dev-server.ts implementation**

Replace lines 46-52 in `src/presentation/web/coasts-dev-server.ts`:

```typescript
  // Step 2: Check for Coastfile — fail if missing (generate on-demand via CLI or web UI)
  const hasCoastfile = await coastsService.hasCoastfile(workDir);
  if (!hasCoastfile) {
    throw new Error(
      `[dev-server:coasts] No Coastfile found in ${workDir} (expected: Coastfile).\n` +
        'Generate one with:\n' +
        '  - CLI:    shep coasts init\n' +
        '  - Web UI: Use the "Generate Coastfile" button on the repository node'
    );
  }
```

Also update the JSDoc comment at line 6 — change "Coastfile generation" to "Coastfile existence check".

- [ ] **Step 5: Run tests to verify they pass (GREEN)**

Run: `pnpm test:unit -- --run tests/unit/presentation/web/coasts-dev-server.test.ts tests/unit/presentation/dev-server-coasts.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/presentation/web/coasts-dev-server.ts tests/unit/presentation/web/coasts-dev-server.test.ts tests/unit/presentation/dev-server-coasts.test.ts
git commit -m "fix(web): replace auto coastfile generation with fail-fast error"
```

---

### Task 2: Create `shep coasts init` CLI command

**Files:**
- Create: `src/presentation/cli/commands/coasts/index.ts`
- Create: `src/presentation/cli/commands/coasts/init.command.ts`
- Modify: `src/presentation/cli/index.ts:109-121`
- Create: `tests/unit/presentation/cli/commands/coasts/init.command.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/unit/presentation/cli/commands/coasts/init.command.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ICoastsService } from '@/application/ports/output/services/coasts-service.interface.js';
import type { PrerequisiteCheckResult } from '@/application/ports/output/services/coasts-service.interface.js';

function createMockCoastsService(): ICoastsService {
  return {
    checkPrerequisites: vi.fn(),
    build: vi.fn(),
    run: vi.fn(),
    stop: vi.fn(),
    lookup: vi.fn(),
    isRunning: vi.fn(),
    checkout: vi.fn(),
    getInstallationPrompt: vi.fn(),
    generateCoastfile: vi.fn(),
    hasCoastfile: vi.fn(),
  };
}

function allMet(): PrerequisiteCheckResult {
  return {
    coastBinary: true,
    docker: true,
    coastdRunning: true,
    allMet: true,
    missingMessages: [],
  };
}

function prerequisitesFailed(messages: string[]): PrerequisiteCheckResult {
  return {
    coastBinary: false,
    docker: false,
    coastdRunning: false,
    allMet: false,
    missingMessages: messages,
  };
}

// Mock the DI container
const mockContainer = {
  resolve: vi.fn(),
};
vi.mock('@/infrastructure/di/container.js', () => ({
  container: mockContainer,
}));

// Import the function under test
const { createInitCommand } = await import(
  '@cli/presentation/cli/commands/coasts/init.command.js'
);

describe('shep coasts init', () => {
  let mockService: ICoastsService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockCoastsService();
    mockContainer.resolve.mockReturnValue(mockService);
  });

  it('calls generateCoastfile then build on success', async () => {
    vi.mocked(mockService.hasCoastfile).mockResolvedValue(false);
    vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMet());
    vi.mocked(mockService.generateCoastfile).mockResolvedValue('/repo/Coastfile');
    vi.mocked(mockService.build).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['node', 'test', '--force']);

    expect(mockService.generateCoastfile).toHaveBeenCalled();
    expect(mockService.build).toHaveBeenCalled();
  });

  it('exits with error when prerequisites fail', async () => {
    vi.mocked(mockService.hasCoastfile).mockResolvedValue(false);
    vi.mocked(mockService.checkPrerequisites).mockResolvedValue(
      prerequisitesFailed(['coast binary not found'])
    );

    const cmd = createInitCommand();
    // Commander sets process.exitCode on error
    await cmd.parseAsync(['node', 'test', '--force']);

    expect(mockService.generateCoastfile).not.toHaveBeenCalled();
  });

  it('skips generation when Coastfile exists and --force not set', async () => {
    vi.mocked(mockService.hasCoastfile).mockResolvedValue(true);

    const cmd = createInitCommand();
    await cmd.parseAsync(['node', 'test']);

    expect(mockService.hasCoastfile).toHaveBeenCalled();
    expect(mockService.generateCoastfile).not.toHaveBeenCalled();
  });

  it('regenerates when Coastfile exists and --force is set', async () => {
    vi.mocked(mockService.hasCoastfile).mockResolvedValue(true);
    vi.mocked(mockService.checkPrerequisites).mockResolvedValue(allMet());
    vi.mocked(mockService.generateCoastfile).mockResolvedValue('/repo/Coastfile');
    vi.mocked(mockService.build).mockResolvedValue(undefined);

    const cmd = createInitCommand();
    await cmd.parseAsync(['node', 'test', '--force']);

    expect(mockService.generateCoastfile).toHaveBeenCalled();
    expect(mockService.build).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

Run: `pnpm test:unit -- --run tests/unit/presentation/cli/commands/coasts/init.command.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the parent coasts command**

Create `src/presentation/cli/commands/coasts/index.ts`:

```typescript
import { Command } from 'commander';
import { createInitCommand } from './init.command.js';

export function createCoastsCommand(): Command {
  return new Command('coasts')
    .description('Manage Coasts containerized runtime')
    .addCommand(createInitCommand());
}
```

- [ ] **Step 4: Create the init subcommand**

Create `src/presentation/cli/commands/coasts/init.command.ts`:

```typescript
import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { ICoastsService } from '@/application/ports/output/services/coasts-service.interface.js';
import { messages, spinner } from '../../ui/index.js';

interface InitOptions {
  force?: boolean;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Generate a Coastfile for the current repository')
    .option('-f, --force', 'Overwrite existing Coastfile without prompting')
    .action(async (options: InitOptions) => {
      const workDir = process.cwd();

      try {
        const coastsService = container.resolve<ICoastsService>('ICoastsService');

        // Check if Coastfile already exists
        const exists = await coastsService.hasCoastfile(workDir);
        if (exists && !options.force) {
          messages.warning(
            'Coastfile already exists. Use --force to regenerate.'
          );
          return;
        }

        // Check prerequisites
        const prereqs = await coastsService.checkPrerequisites(workDir);
        if (!prereqs.allMet) {
          for (const msg of prereqs.missingMessages) {
            messages.error(msg);
          }
          process.exitCode = 1;
          return;
        }

        // Generate Coastfile
        const coastfilePath = await spinner(
          'Generating Coastfile via AI agent...',
          () => coastsService.generateCoastfile(workDir)
        );
        messages.success(`Coastfile generated at ${coastfilePath}`);

        // Build container
        await spinner('Building coast container...', () =>
          coastsService.build(workDir)
        );
        messages.success('Coast container built successfully.');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to initialize Coasts', err);
        process.exitCode = 1;
      }
    });
}
```

- [ ] **Step 5: Register the coasts command in CLI index.ts**

Add to `src/presentation/cli/index.ts` after the existing command registrations (around line 121):

```typescript
import { createCoastsCommand } from './commands/coasts/index.js';
```

And in the registration block:

```typescript
program.addCommand(createCoastsCommand());
```

- [ ] **Step 6: Run test to verify it passes (GREEN)**

Run: `pnpm test:unit -- --run tests/unit/presentation/cli/commands/coasts/init.command.test.ts`
Expected: PASS

- [ ] **Step 7: Run full test suite to check for regressions**

Run: `pnpm test:unit -- --run`
Expected: PASS (all tests)

- [ ] **Step 8: Commit**

```bash
git add src/presentation/cli/commands/coasts/ src/presentation/cli/index.ts tests/unit/presentation/cli/commands/coasts/
git commit -m "feat(cli): add shep coasts init command for on-demand coastfile generation"
```

---

### Task 3: Create server action for Coastfile generation

**Files:**
- Create: `src/presentation/web/app/actions/generate-coastfile.ts`
- Create: `src/presentation/web/app/actions/check-coastfile.ts`
- Create: `.storybook/mocks/app/actions/generate-coastfile.ts`
- Create: `.storybook/mocks/app/actions/check-coastfile.ts`

- [ ] **Step 1: Create the generate-coastfile server action**

Create `src/presentation/web/app/actions/generate-coastfile.ts`:

```typescript
'use server';

import path from 'node:path';
import { existsSync } from 'node:fs';
import { resolve } from '@/lib/server-container';
import type { ICoastsService } from '@shepai/core/application/ports/output/services/coasts-service.interface';

export interface GenerateCoastfileResult {
  success: boolean;
  coastfilePath?: string;
  error?: string;
}

export async function generateCoastfileAction(
  repositoryPath: string
): Promise<GenerateCoastfileResult> {
  if (!repositoryPath || !path.isAbsolute(repositoryPath)) {
    return { success: false, error: 'repositoryPath must be an absolute path' };
  }

  if (!existsSync(repositoryPath)) {
    return { success: false, error: `Directory does not exist: ${repositoryPath}` };
  }

  try {
    const coastsService = resolve<ICoastsService>('ICoastsService');
    const coastfilePath = await coastsService.generateCoastfile(repositoryPath);
    await coastsService.build(repositoryPath);
    return { success: true, coastfilePath };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate Coastfile';
    return { success: false, error: message };
  }
}
```

- [ ] **Step 2: Create the check-coastfile server action**

Create `src/presentation/web/app/actions/check-coastfile.ts`:

```typescript
'use server';

import path from 'node:path';
import { resolve } from '@/lib/server-container';
import type { ICoastsService } from '@shepai/core/application/ports/output/services/coasts-service.interface';

export interface CheckCoastfileResult {
  exists: boolean;
}

export async function checkCoastfileAction(
  repositoryPath: string
): Promise<CheckCoastfileResult> {
  if (!repositoryPath || !path.isAbsolute(repositoryPath)) {
    return { exists: false };
  }

  try {
    const coastsService = resolve<ICoastsService>('ICoastsService');
    const exists = await coastsService.hasCoastfile(repositoryPath);
    return { exists };
  } catch {
    return { exists: false };
  }
}
```

- [ ] **Step 3: Create Storybook mocks**

Create `.storybook/mocks/app/actions/generate-coastfile.ts`:

```typescript
export async function generateCoastfileAction(
  _repositoryPath: string
): Promise<{ success: boolean; coastfilePath?: string; error?: string }> {
  return { success: false, error: 'Not available in Storybook' };
}
```

Create `.storybook/mocks/app/actions/check-coastfile.ts`:

```typescript
export async function checkCoastfileAction(
  _repositoryPath: string
): Promise<{ exists: boolean }> {
  return { exists: false };
}
```

- [ ] **Step 4: Run build to verify no import errors**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/presentation/web/app/actions/generate-coastfile.ts src/presentation/web/app/actions/check-coastfile.ts .storybook/mocks/app/actions/generate-coastfile.ts .storybook/mocks/app/actions/check-coastfile.ts
git commit -m "feat(web): add server actions for on-demand coastfile generation"
```

---

### Task 4: Create useCoastsActions hook

**Files:**
- Create: `src/presentation/web/components/common/repository-node/use-coasts-actions.ts`
- Create: `tests/unit/presentation/web/components/common/repository-node/use-coasts-actions.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/unit/presentation/web/components/common/repository-node/use-coasts-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock server actions
vi.mock('@/app/actions/generate-coastfile', () => ({
  generateCoastfileAction: vi.fn(),
}));
vi.mock('@/app/actions/check-coastfile', () => ({
  checkCoastfileAction: vi.fn(),
}));

import { generateCoastfileAction } from '@/app/actions/generate-coastfile';
import { checkCoastfileAction } from '@/app/actions/check-coastfile';
import { useCoastsActions } from '@cli/presentation/web/components/common/repository-node/use-coasts-actions.js';

describe('useCoastsActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks coastfile existence on mount', async () => {
    vi.mocked(checkCoastfileAction).mockResolvedValue({ exists: true });

    const { result } = renderHook(() =>
      useCoastsActions({ repositoryPath: '/repos/my-project' })
    );

    // Wait for the async mount check
    await vi.waitFor(() => {
      expect(result.current.coastfileExists).toBe(true);
    });

    expect(checkCoastfileAction).toHaveBeenCalledWith('/repos/my-project');
  });

  it('returns coastfileExists false when no Coastfile', async () => {
    vi.mocked(checkCoastfileAction).mockResolvedValue({ exists: false });

    const { result } = renderHook(() =>
      useCoastsActions({ repositoryPath: '/repos/my-project' })
    );

    await vi.waitFor(() => {
      expect(result.current.coastfileExists).toBe(false);
    });
  });

  it('calls generateCoastfileAction and updates state on success', async () => {
    vi.mocked(checkCoastfileAction).mockResolvedValue({ exists: false });
    vi.mocked(generateCoastfileAction).mockResolvedValue({
      success: true,
      coastfilePath: '/repos/my-project/Coastfile',
    });

    const { result } = renderHook(() =>
      useCoastsActions({ repositoryPath: '/repos/my-project' })
    );

    await vi.waitFor(() => {
      expect(result.current.checkLoading).toBe(false);
    });

    await act(async () => {
      await result.current.generateCoastfile();
    });

    expect(generateCoastfileAction).toHaveBeenCalledWith('/repos/my-project');
    expect(result.current.coastfileExists).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('sets error on generateCoastfileAction failure', async () => {
    vi.mocked(checkCoastfileAction).mockResolvedValue({ exists: false });
    vi.mocked(generateCoastfileAction).mockResolvedValue({
      success: false,
      error: 'Agent failed',
    });

    const { result } = renderHook(() =>
      useCoastsActions({ repositoryPath: '/repos/my-project' })
    );

    await vi.waitFor(() => {
      expect(result.current.checkLoading).toBe(false);
    });

    await act(async () => {
      await result.current.generateCoastfile();
    });

    expect(result.current.error).toBe('Agent failed');
    expect(result.current.coastfileExists).toBe(false);
  });

  it('returns no-op state when input is null', () => {
    const { result } = renderHook(() => useCoastsActions(null));

    expect(result.current.coastfileExists).toBe(false);
    expect(result.current.generating).toBe(false);
    expect(checkCoastfileAction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (RED)**

Run: `pnpm test:unit -- --run tests/unit/presentation/web/components/common/repository-node/use-coasts-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the useCoastsActions hook**

Create `src/presentation/web/components/common/repository-node/use-coasts-actions.ts`:

```typescript
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { generateCoastfileAction } from '@/app/actions/generate-coastfile';
import { checkCoastfileAction } from '@/app/actions/check-coastfile';

export interface CoastsActionsInput {
  repositoryPath: string;
}

export interface CoastsActionsState {
  coastfileExists: boolean;
  generating: boolean;
  checkLoading: boolean;
  error: string | null;
  generateCoastfile: () => Promise<void>;
}

const ERROR_CLEAR_DELAY = 5000;

export function useCoastsActions(input: CoastsActionsInput | null): CoastsActionsState {
  const repoPath = input?.repositoryPath ?? null;
  const [coastfileExists, setCoastfileExists] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [checkLoading, setCheckLoading] = useState(!!repoPath);
  const [error, setError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ref = errorTimerRef;
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, []);

  // Check coastfile existence on mount — use repoPath (string) as dep to avoid infinite re-renders
  useEffect(() => {
    if (!repoPath) return;

    let cancelled = false;
    setCheckLoading(true);

    checkCoastfileAction(repoPath)
      .then((result) => {
        if (!cancelled) {
          setCoastfileExists(result.exists);
          setCheckLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCoastfileExists(false);
          setCheckLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  const handleGenerate = useCallback(async () => {
    if (!repoPath || generating) return;

    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);

    setGenerating(true);
    setError(null);

    try {
      const result = await generateCoastfileAction(repoPath);

      if (result.success) {
        setCoastfileExists(true);
      } else {
        setError(result.error ?? 'Failed to generate Coastfile');
        errorTimerRef.current = setTimeout(() => setError(null), ERROR_CLEAR_DELAY);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate Coastfile';
      setError(message);
      errorTimerRef.current = setTimeout(() => setError(null), ERROR_CLEAR_DELAY);
    } finally {
      setGenerating(false);
    }
  }, [repoPath, generating]);

  return {
    coastfileExists,
    generating,
    checkLoading,
    error,
    generateCoastfile: handleGenerate,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass (GREEN)**

Run: `pnpm test:unit -- --run tests/unit/presentation/web/components/common/repository-node/use-coasts-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/presentation/web/components/common/repository-node/use-coasts-actions.ts tests/unit/presentation/web/components/common/repository-node/use-coasts-actions.test.ts
git commit -m "feat(web): add use-coasts-actions hook for on-demand coastfile generation"
```

---

### Task 5: Add Coastfile generation button to repository node

**Files:**
- Modify: `src/presentation/web/components/common/repository-node/repository-node.tsx:1-50,374-439`

- [ ] **Step 1: Add imports to repository-node.tsx**

Add `FileCode2` to the lucide-react imports (line 6-20):

```typescript
import {
  Github,
  Plus,
  Code2,
  Terminal,
  FolderOpen,
  Trash2,
  Play,
  Square,
  GitBranch,
  GitCommitHorizontal,
  ArrowDown,
  User,
  RotateCcw,
  FileCode2,
} from 'lucide-react';
```

Add the hook import after line 37:

```typescript
import { useCoastsActions } from './use-coasts-actions';
```

- [ ] **Step 2: Wire up the hook in the component**

After line 49 (where `deployAction` is created), add:

```typescript
const coastsActions = useCoastsActions(
  data.repositoryPath ? { repositoryPath: data.repositoryPath } : null
);
```

- [ ] **Step 3: Add the Coastfile button as a standalone section**

Row 4 (dev server) is gated by `featureFlags.envDeploy`, so the Coastfile button needs its own section visible when `coastsDevServer` is enabled — independent of `envDeploy`. Add this **after** the Row 4 block (after line 439), before the source handle:

```typescript
{/* Row 5: Coastfile generation — visible when coastsDevServer flag is on */}
{featureFlags.coastsDevServer && data.repositoryPath ? (
  <div
    data-testid="repository-node-coastfile"
    className="border-t px-4 py-2"
    onClick={(e) => e.stopPropagation()}
  >
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">
        {coastsActions.coastfileExists ? 'Coastfile' : 'No Coastfile'}
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="ml-auto flex items-center">
              <ActionButton
                label={coastsActions.coastfileExists ? 'Regenerate Coastfile' : 'Generate Coastfile'}
                onClick={coastsActions.generateCoastfile}
                loading={coastsActions.generating || coastsActions.checkLoading}
                error={!!coastsActions.error}
                icon={FileCode2}
                iconOnly
                variant="ghost"
                size="icon-xs"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {coastsActions.error ?? (coastsActions.coastfileExists ? 'Regenerate Coastfile' : 'Generate Coastfile')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </div>
) : null}
```

- [ ] **Step 4: Run build to verify no type errors**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Run existing repository-node tests**

Run: `pnpm test:unit -- --run tests/unit/presentation/web/components/common/`
Expected: PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add src/presentation/web/components/common/repository-node/repository-node.tsx
git commit -m "feat(web): add coastfile generation button to repository node"
```

---

### Task 6: Update spec.yaml and run full validation

**Files:**
- Modify: `specs/072-coasts-dev-server/spec.yaml`

- [ ] **Step 1: Update FR-8 in spec.yaml**

Replace the FR-8 content about auto-generation during startup with on-demand generation:

> **FR-8: Coastfile on-demand generation** — Coastfile generation is triggered explicitly by the user via `shep coasts init` CLI command or the "Generate Coastfile" button on the repository node in the web UI. The dev server does NOT auto-generate Coastfiles. When the Coasts feature flag is enabled and no Coastfile exists, the dev server fails with a helpful error message pointing the user to both generation methods.

- [ ] **Step 2: Update FR-9 step 3**

Change step 3 from "run generateCoastfile" to:

> 3. Check for Coastfile — if missing, exit with a non-zero code and a human-readable error listing both generation methods (CLI and web UI)

- [ ] **Step 3: Add FR-14 and FR-15**

Add:

> **FR-14: CLI command `shep coasts init`** — A `shep coasts init` CLI command generates a Coastfile for the current working directory. It checks prerequisites, generates the Coastfile via AI agent using `coast installation-prompt`, and builds the coast container. Supports `--force` flag to overwrite an existing Coastfile without prompting.

> **FR-15: Web UI generate Coastfile button** — A "Generate Coastfile" button in the repository node's dev server section (visible when `coastsDevServer` flag is enabled). Uses a server action that resolves `ICoastsService`, validates the repository path, generates the Coastfile, and builds the container. Button label changes to "Regenerate Coastfile" when a Coastfile already exists.

- [ ] **Step 4: Run full validation**

Run: `pnpm validate`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add specs/072-coasts-dev-server/spec.yaml
git commit -m "chore(specs): update fr-8 fr-9 and add fr-14 fr-15 for on-demand coastfile generation"
```
