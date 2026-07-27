/**
 * Worktree Hook Runner Stubs
 *
 * WorktreeService injects IWorktreeHookRunner to support the user-configurable
 * `settings.worktree` provisioning commands. Tests that only exercise the
 * built-in git flow use `noopWorktreeHookRunner()`; tests that exercise the
 * custom-command path build a spy runner with `stubWorktreeHookRunner()`.
 */

import { vi } from 'vitest';
import type {
  IWorktreeHookRunner,
  WorktreeHookContext,
} from '@/application/ports/output/services/worktree-hook-runner.interface.js';

export interface StubWorktreeHookRunner extends IWorktreeHookRunner {
  hasCreateHook: ReturnType<typeof vi.fn<() => boolean>>;
  runCreateHook: ReturnType<typeof vi.fn<(context: WorktreeHookContext) => Promise<void>>>;
  runPostCreateHook: ReturnType<typeof vi.fn<(context: WorktreeHookContext) => Promise<void>>>;
}

/**
 * A spy hook runner. Defaults to "no custom commands configured", matching a
 * fresh install.
 */
export function stubWorktreeHookRunner(hasCreateHook = false): StubWorktreeHookRunner {
  return {
    hasCreateHook: vi.fn<() => boolean>(() => hasCreateHook),
    runCreateHook: vi.fn<(context: WorktreeHookContext) => Promise<void>>(async () => undefined),
    runPostCreateHook: vi.fn<(context: WorktreeHookContext) => Promise<void>>(
      async () => undefined
    ),
  };
}

/**
 * A hook runner that never runs anything — for tests that do not care about
 * custom provisioning at all.
 */
export function noopWorktreeHookRunner(): IWorktreeHookRunner {
  return {
    hasCreateHook: () => false,
    runCreateHook: async () => undefined,
    runPostCreateHook: async () => undefined,
  };
}
