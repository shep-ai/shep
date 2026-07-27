/**
 * WorktreeService custom-provisioning Unit Tests
 *
 * Covers how WorktreeService delegates to the user-configured
 * `settings.worktree` commands: a create command replaces `git worktree add`
 * entirely, and the post-create command runs for both the custom and the
 * built-in flow once the tree exists.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WorktreeService } from '@/infrastructure/services/git/worktree.service.js';
import {
  stubWorktreeHookRunner,
  type StubWorktreeHookRunner,
} from '@tests/helpers/worktree-hook-runner.stub.js';

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

const REPO_PATH = '/repos/monorepo';
const BRANCH = 'feat/thing';
const WORKTREE_PATH = '/home/user/.shep/repos/abc/wt/feat-thing';
const DEFAULT_BRANCH = 'main';

/** `git worktree list --porcelain` output with the branch registered. */
const REGISTERED_LIST = [
  `worktree ${REPO_PATH}`,
  'HEAD 111111',
  'branch refs/heads/main',
  '',
  `worktree ${WORKTREE_PATH}`,
  'HEAD abc123',
  `branch refs/heads/${BRANCH}`,
  '',
].join('\n');

describe('WorktreeService custom provisioning', () => {
  let mockExecFile: ReturnType<typeof vi.fn<ExecFileFn>>;
  let hookRunner: StubWorktreeHookRunner;

  beforeEach(() => {
    mockExecFile = vi.fn<ExecFileFn>();
    hookRunner = stubWorktreeHookRunner();
  });

  function serviceUnderTest(): WorktreeService {
    return new WorktreeService(mockExecFile, hookRunner);
  }

  function gitCalls(): string[][] {
    return mockExecFile.mock.calls.filter((c) => c[0] === 'git').map((c) => c[1]);
  }

  describe('create', () => {
    it('runs `git worktree add` and the post-create hook when no create hook exists', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: REGISTERED_LIST, stderr: '' });

      await serviceUnderTest().create(REPO_PATH, BRANCH, WORKTREE_PATH, DEFAULT_BRANCH);

      expect(gitCalls()[0]).toEqual([
        'worktree',
        'add',
        WORKTREE_PATH,
        '-b',
        BRANCH,
        DEFAULT_BRANCH,
      ]);
      expect(hookRunner.runCreateHook).not.toHaveBeenCalled();
      expect(hookRunner.runPostCreateHook).toHaveBeenCalledWith({
        repoPath: REPO_PATH,
        worktreePath: WORKTREE_PATH,
        branch: BRANCH,
        startPoint: DEFAULT_BRANCH,
      });
    });

    it('delegates to the create hook instead of `git worktree add`', async () => {
      hookRunner.hasCreateHook.mockReturnValue(true);
      mockExecFile.mockResolvedValueOnce({ stdout: REGISTERED_LIST, stderr: '' });

      const result = await serviceUnderTest().create(
        REPO_PATH,
        BRANCH,
        WORKTREE_PATH,
        DEFAULT_BRANCH
      );

      expect(hookRunner.runCreateHook).toHaveBeenCalledWith({
        repoPath: REPO_PATH,
        worktreePath: WORKTREE_PATH,
        branch: BRANCH,
        startPoint: DEFAULT_BRANCH,
      });
      expect(gitCalls()).toEqual([['worktree', 'list', '--porcelain']]);
      expect(result.branch).toBe(BRANCH);
      expect(result.path).toBe(WORKTREE_PATH);
    });

    it('propagates a create-hook failure without touching git', async () => {
      hookRunner.hasCreateHook.mockReturnValue(true);
      hookRunner.runCreateHook.mockRejectedValueOnce(new Error('provisioner exploded'));

      await expect(
        serviceUnderTest().create(REPO_PATH, BRANCH, WORKTREE_PATH, DEFAULT_BRANCH)
      ).rejects.toThrow('provisioner exploded');
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('runs the post-create hook only after the worktree is resolved', async () => {
      const order: string[] = [];
      mockExecFile.mockImplementation(async (_cmd, args) => {
        order.push(`git ${args.join(' ')}`);
        return { stdout: args[1] === 'list' ? REGISTERED_LIST : '', stderr: '' };
      });
      hookRunner.runPostCreateHook.mockImplementation(async () => {
        order.push('post-create');
      });

      await serviceUnderTest().create(REPO_PATH, BRANCH, WORKTREE_PATH, DEFAULT_BRANCH);

      expect(order).toEqual([
        `git worktree add ${WORKTREE_PATH} -b ${BRANCH} ${DEFAULT_BRANCH}`,
        'git worktree list --porcelain',
        'post-create',
      ]);
    });

    it('propagates a post-create-hook failure', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: REGISTERED_LIST, stderr: '' });
      hookRunner.runPostCreateHook.mockRejectedValueOnce(new Error('symlink step failed'));

      await expect(
        serviceUnderTest().create(REPO_PATH, BRANCH, WORKTREE_PATH, DEFAULT_BRANCH)
      ).rejects.toThrow('symlink step failed');
    });
  });

  describe('addExisting', () => {
    it('delegates to the create hook with no start point', async () => {
      hookRunner.hasCreateHook.mockReturnValue(true);
      mockExecFile.mockResolvedValueOnce({ stdout: REGISTERED_LIST, stderr: '' });

      await serviceUnderTest().addExisting(REPO_PATH, BRANCH, WORKTREE_PATH);

      expect(hookRunner.runCreateHook).toHaveBeenCalledWith({
        repoPath: REPO_PATH,
        worktreePath: WORKTREE_PATH,
        branch: BRANCH,
      });
      expect(gitCalls()).toEqual([['worktree', 'list', '--porcelain']]);
    });

    it('runs the post-create hook for the built-in flow too', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: REGISTERED_LIST, stderr: '' });

      await serviceUnderTest().addExisting(REPO_PATH, BRANCH, WORKTREE_PATH);

      expect(gitCalls()[0]).toEqual(['worktree', 'add', WORKTREE_PATH, BRANCH]);
      expect(hookRunner.runPostCreateHook).toHaveBeenCalledWith({
        repoPath: REPO_PATH,
        worktreePath: WORKTREE_PATH,
        branch: BRANCH,
      });
    });
  });
});
