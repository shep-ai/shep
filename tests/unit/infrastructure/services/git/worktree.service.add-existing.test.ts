/**
 * WorktreeService.addExisting() Unit Tests
 *
 * Tests for attaching a worktree to an already-existing branch
 * (git worktree add <path> <branch> — no -b flag).
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WorktreeService } from '@/infrastructure/services/git/worktree.service.js';
import {
  stubWorktreeHookRunner,
  type StubWorktreeHookRunner,
} from '@tests/helpers/worktree-hook-runner.stub.js';
import {
  WorktreeError,
  WorktreeErrorCode,
} from '@/application/ports/output/services/worktree-service.interface.js';

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

describe('WorktreeService.addExisting', () => {
  let service: WorktreeService;
  let mockExecFile: ReturnType<typeof vi.fn<ExecFileFn>>;
  let hookRunner: StubWorktreeHookRunner;

  beforeEach(() => {
    mockExecFile = vi.fn<ExecFileFn>();
    hookRunner = stubWorktreeHookRunner();
    service = new WorktreeService(mockExecFile, hookRunner);
  });

  it('should call execFile with correct git args (no -b flag)', async () => {
    const wtPath = '/home/user/.shep/repos/abc/wt/my-branch';

    mockExecFile
      // git worktree add
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // git worktree list --porcelain
      .mockResolvedValueOnce({
        stdout: [
          'worktree /repo',
          'HEAD 111111',
          'branch refs/heads/main',
          '',
          `worktree ${wtPath}`,
          'HEAD abc123',
          'branch refs/heads/my-branch',
          '',
        ].join('\n'),
        stderr: '',
      });

    await service.addExisting('/repo', 'my-branch', wtPath);

    expect(mockExecFile).toHaveBeenCalledWith('git', ['worktree', 'add', wtPath, 'my-branch'], {
      cwd: '/repo',
    });
    // Verify -b is NOT in the args
    const addCall = mockExecFile.mock.calls[0];
    expect(addCall[1]).not.toContain('-b');
  });

  it('should return WorktreeInfo with expected fields', async () => {
    const wtPath = '/home/user/.shep/repos/abc/wt/feat-login';

    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }).mockResolvedValueOnce({
      stdout: [
        'worktree /repo',
        'HEAD 111111',
        'branch refs/heads/main',
        '',
        `worktree ${wtPath}`,
        'HEAD def456',
        'branch refs/heads/feat/login',
        '',
      ].join('\n'),
      stderr: '',
    });

    const result = await service.addExisting('/repo', 'feat/login', wtPath);

    expect(result).toEqual({
      path: wtPath,
      head: 'def456',
      branch: 'feat/login',
      isMain: false,
    });
  });

  it('should propagate git errors with descriptive WorktreeError', async () => {
    mockExecFile.mockRejectedValue(new Error("fatal: invalid reference: 'nonexistent-branch'"));

    await expect(service.addExisting('/repo', 'nonexistent-branch', '/some/path')).rejects.toThrow(
      WorktreeError
    );

    try {
      await service.addExisting('/repo', 'nonexistent-branch', '/some/path');
    } catch (e) {
      expect(e).toBeInstanceOf(WorktreeError);
      expect((e as WorktreeError).code).toBe(WorktreeErrorCode.GIT_ERROR);
      expect((e as WorktreeError).message).toContain('nonexistent-branch');
    }
  });

  it('should throw ALREADY_EXISTS when worktree path already exists', async () => {
    mockExecFile.mockRejectedValue(new Error("fatal: '/some/path' already exists"));

    try {
      await service.addExisting('/repo', 'my-branch', '/some/path');
    } catch (e) {
      expect(e).toBeInstanceOf(WorktreeError);
      expect((e as WorktreeError).code).toBe(WorktreeErrorCode.ALREADY_EXISTS);
    }
  });

  it('should throw BRANCH_IN_USE when branch is already checked out', async () => {
    mockExecFile.mockRejectedValue(new Error("fatal: 'my-branch' is already checked out"));

    try {
      await service.addExisting('/repo', 'my-branch', '/some/path');
    } catch (e) {
      expect(e).toBeInstanceOf(WorktreeError);
      expect((e as WorktreeError).code).toBe(WorktreeErrorCode.BRANCH_IN_USE);
    }
  });

  it('should throw GIT_ERROR when created worktree not found in list', async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' });

    try {
      await service.addExisting('/repo', 'my-branch', '/path');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(WorktreeError);
      expect((e as WorktreeError).code).toBe(WorktreeErrorCode.GIT_ERROR);
      expect((e as WorktreeError).message).toContain('not found in list');
    }
  });

  it('should work with remote tracking refs (origin/<branch>)', async () => {
    const wtPath = '/home/user/.shep/repos/abc/wt/feat-remote';

    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }).mockResolvedValueOnce({
      stdout: [
        'worktree /repo',
        'HEAD 111111',
        'branch refs/heads/main',
        '',
        `worktree ${wtPath}`,
        'HEAD aaa111',
        'branch refs/heads/feat/remote',
        '',
      ].join('\n'),
      stderr: '',
    });

    const result = await service.addExisting('/repo', 'origin/feat/remote', wtPath);

    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', wtPath, 'origin/feat/remote'],
      { cwd: '/repo' }
    );
    // Git creates a local branch tracking the remote, so the list shows the local branch name
    expect(result.branch).toBe('feat/remote');
  });

  it('should match worktree by path when branch name differs from arg', async () => {
    const wtPath = '/home/user/.shep/repos/abc/wt/some-branch';

    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }).mockResolvedValueOnce({
      stdout: [
        'worktree /repo',
        'HEAD 111111',
        'branch refs/heads/main',
        '',
        `worktree ${wtPath}`,
        'HEAD bbb222',
        'branch refs/heads/some-branch',
        '',
      ].join('\n'),
      stderr: '',
    });

    // Pass origin/some-branch but git creates local "some-branch"
    const result = await service.addExisting('/repo', 'origin/some-branch', wtPath);

    expect(result.path).toBe(wtPath);
    expect(result.branch).toBe('some-branch');
  });
});
