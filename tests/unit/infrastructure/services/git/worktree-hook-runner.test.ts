/**
 * WorktreeHookRunner Unit Tests
 *
 * Covers the user-configurable worktree provisioning commands
 * (`settings.worktree`): when they run, what environment and working
 * directory they get, and how failures surface.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WorktreeHookRunner } from '@/infrastructure/services/git/worktree-hook-runner.js';
import { DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS } from '@/domain/shared/worktree-config.js';
import {
  WorktreeError,
  WorktreeErrorCode,
} from '@/application/ports/output/services/worktree-service.interface.js';
import type { WorktreeHookContext } from '@/application/ports/output/services/worktree-hook-runner.interface.js';
import type { ISettingsProvider } from '@/application/ports/output/services/settings-provider.interface.js';
import type { Settings, WorktreeConfig } from '@/domain/generated/output.js';

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

interface ExecOptions {
  cwd?: string;
  shell?: boolean;
  timeout?: number;
  env?: Record<string, string>;
}

const REPO_PATH = '/repos/monorepo';
const BRANCH = 'feat/thing';
const START_POINT = 'main';

function settingsProviderFor(worktree: WorktreeConfig | undefined): ISettingsProvider {
  return {
    has: () => true,
    get: () => ({ worktree }) as unknown as Settings,
  };
}

describe('WorktreeHookRunner', () => {
  let mockExecFile: ReturnType<typeof vi.fn<ExecFileFn>>;
  let worktreePath: string;
  let context: WorktreeHookContext;

  beforeEach(() => {
    mockExecFile = vi.fn<ExecFileFn>().mockResolvedValue({ stdout: '', stderr: '' });
    // The create hook must leave a real directory behind, so use a temp dir.
    worktreePath = mkdtempSync(join(tmpdir(), 'shep-wt-hook-'));
    context = { repoPath: REPO_PATH, worktreePath, branch: BRANCH, startPoint: START_POINT };
  });

  afterEach(() => {
    rmSync(worktreePath, { recursive: true, force: true });
  });

  function runnerFor(worktree: WorktreeConfig | undefined): WorktreeHookRunner {
    return new WorktreeHookRunner(mockExecFile, settingsProviderFor(worktree));
  }

  function lastOptions(): ExecOptions {
    const call = mockExecFile.mock.calls.at(-1);
    return (call?.[2] ?? {}) as ExecOptions;
  }

  describe('hasCreateHook', () => {
    it('is false when settings have no worktree config', () => {
      expect(runnerFor(undefined).hasCreateHook()).toBe(false);
    });

    it('is false when the create command is blank', () => {
      expect(runnerFor({ createCommand: '   ' }).hasCreateHook()).toBe(false);
    });

    it('is false when settings are not initialized yet', () => {
      const uninitialized: ISettingsProvider = {
        has: () => false,
        get: () => {
          throw new Error('settings not loaded');
        },
      };
      expect(new WorktreeHookRunner(mockExecFile, uninitialized).hasCreateHook()).toBe(false);
    });

    it('is true when a create command is configured', () => {
      expect(runnerFor({ createCommand: 'my-tool create' }).hasCreateHook()).toBe(true);
    });
  });

  describe('runCreateHook', () => {
    it('runs the command through the shell from the main repository', async () => {
      await runnerFor({ createCommand: 'my-tool create' }).runCreateHook(context);

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const [command, args] = mockExecFile.mock.calls[0]!;
      expect(command).toBe('my-tool create');
      // Empty args: the whole command line goes to the shell verbatim.
      expect(args).toEqual([]);
      expect(lastOptions().cwd).toBe(REPO_PATH);
      expect(lastOptions().shell).toBe(true);
    });

    it('exports the worktree context as SHEP_ environment variables', async () => {
      await runnerFor({ createCommand: 'my-tool create' }).runCreateHook(context);

      expect(lastOptions().env).toMatchObject({
        SHEP_REPO_PATH: REPO_PATH,
        SHEP_WORKTREE_PATH: worktreePath,
        SHEP_BRANCH: BRANCH,
        SHEP_START_POINT: START_POINT,
      });
    });

    it('exports an empty start point when the branch already exists', async () => {
      const existingBranch: WorktreeHookContext = {
        repoPath: REPO_PATH,
        worktreePath,
        branch: BRANCH,
      };
      await runnerFor({ createCommand: 'my-tool create' }).runCreateHook(existingBranch);

      expect(lastOptions().env).toMatchObject({ SHEP_START_POINT: '' });
    });

    it('applies the default timeout when none is configured', async () => {
      await runnerFor({ createCommand: 'my-tool create' }).runCreateHook(context);

      expect(lastOptions().timeout).toBe(DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS);
    });

    it('applies a configured timeout', async () => {
      await runnerFor({ createCommand: 'my-tool create', commandTimeoutMs: 1234 }).runCreateHook(
        context
      );

      expect(lastOptions().timeout).toBe(1234);
    });

    it('throws HOOK_FAILED when no create command is configured', async () => {
      await expect(runnerFor(undefined).runCreateHook(context)).rejects.toMatchObject({
        code: WorktreeErrorCode.HOOK_FAILED,
      });
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('throws HOOK_FAILED with the command output when the command fails', async () => {
      mockExecFile.mockRejectedValueOnce(
        Object.assign(new Error('Command failed: my-tool create'), {
          stdout: 'boom on stdout',
          stderr: 'boom on stderr',
        })
      );

      const error = await runnerFor({ createCommand: 'my-tool create' })
        .runCreateHook(context)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(WorktreeError);
      expect((error as WorktreeError).code).toBe(WorktreeErrorCode.HOOK_FAILED);
      expect((error as WorktreeError).message).toContain('worktree.createCommand');
      expect((error as WorktreeError).message).toContain('boom on stdout');
      expect((error as WorktreeError).message).toContain('boom on stderr');
    });

    it('throws HOOK_FAILED when the command succeeds without creating the worktree', async () => {
      const missing: WorktreeHookContext = {
        ...context,
        worktreePath: join(worktreePath, 'never-created'),
      };

      const error = await runnerFor({ createCommand: 'my-tool create' })
        .runCreateHook(missing)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(WorktreeError);
      expect((error as WorktreeError).code).toBe(WorktreeErrorCode.HOOK_FAILED);
      expect((error as WorktreeError).message).toContain('did not create');
    });
  });

  describe('runPostCreateHook', () => {
    it('does nothing when no post-create command is configured', async () => {
      await runnerFor({ createCommand: 'my-tool create' }).runPostCreateHook(context);

      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('runs inside the worktree so relative symlinks resolve there', async () => {
      await runnerFor({ postCreateCommand: 'ln -s ../../node_modules .' }).runPostCreateHook(
        context
      );

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(mockExecFile.mock.calls[0]![0]).toBe('ln -s ../../node_modules .');
      expect(lastOptions().cwd).toBe(worktreePath);
      expect(lastOptions().env).toMatchObject({ SHEP_WORKTREE_PATH: worktreePath });
    });

    it('throws HOOK_FAILED when the command fails', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('ln: File exists'));

      const error = await runnerFor({ postCreateCommand: 'ln -s x y' })
        .runPostCreateHook(context)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(WorktreeError);
      expect((error as WorktreeError).code).toBe(WorktreeErrorCode.HOOK_FAILED);
      expect((error as WorktreeError).message).toContain('worktree.postCreateCommand');
    });
  });
});
