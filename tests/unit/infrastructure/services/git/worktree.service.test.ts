/**
 * WorktreeService Unit Tests
 *
 * Tests for the git worktree management service.
 * Uses constructor-injected exec function mock (NOT vi.mock of child_process).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vi.mock factory requires runtime import()
  const actual = (await importOriginal()) as typeof import('node:fs');
  return { ...actual, mkdirSync: vi.fn() };
});

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

describe('WorktreeService', () => {
  let service: WorktreeService;
  let mockExecFile: ReturnType<typeof vi.fn<ExecFileFn>>;
  let hookRunner: StubWorktreeHookRunner;

  beforeEach(() => {
    mockExecFile = vi.fn<ExecFileFn>();
    hookRunner = stubWorktreeHookRunner();
    service = new WorktreeService(mockExecFile, hookRunner);
  });

  describe('create', () => {
    it('should create worktree with correct git command', async () => {
      const wtPath = service.getWorktreePath('/repo', 'my-branch');

      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }).mockResolvedValueOnce({
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

      const result = await service.create('/repo', 'my-branch', wtPath);

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', wtPath, '-b', 'my-branch'],
        { cwd: '/repo' }
      );
      expect(result.branch).toBe('my-branch');
      expect(result.path).toBe(wtPath);
      expect(result.head).toBe('abc123');
    });

    it('should throw ALREADY_EXISTS when worktree path exists', async () => {
      mockExecFile.mockRejectedValue(new Error("fatal: '/path' already exists"));

      await expect(service.create('/repo', 'my-branch', '/path')).rejects.toThrow(WorktreeError);

      try {
        await service.create('/repo', 'my-branch', '/path');
      } catch (e) {
        expect(e).toBeInstanceOf(WorktreeError);
        expect((e as WorktreeError).code).toBe(WorktreeErrorCode.ALREADY_EXISTS);
      }
    });

    it('should throw BRANCH_IN_USE when branch is checked out', async () => {
      mockExecFile.mockRejectedValue(new Error("fatal: 'my-branch' is already checked out"));

      await expect(service.create('/repo', 'my-branch', '/path')).rejects.toThrow(WorktreeError);

      try {
        await service.create('/repo', 'my-branch', '/path');
      } catch (e) {
        expect(e).toBeInstanceOf(WorktreeError);
        expect((e as WorktreeError).code).toBe(WorktreeErrorCode.BRANCH_IN_USE);
      }
    });

    it('should throw GIT_ERROR for unknown git errors', async () => {
      mockExecFile.mockRejectedValue(new Error('fatal: unknown error occurred'));

      try {
        await service.create('/repo', 'my-branch', '/path');
      } catch (e) {
        expect(e).toBeInstanceOf(WorktreeError);
        expect((e as WorktreeError).code).toBe(WorktreeErrorCode.GIT_ERROR);
      }
    });

    it('should throw GIT_ERROR when created worktree not found in list', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await expect(service.create('/repo', 'my-branch', '/path')).rejects.toThrow(WorktreeError);
    });

    it('should match created worktree when git reports /private/var path on macOS', async () => {
      const expectedPath = '/var/folders/abc/worktree-path';
      const reportedPath = process.platform === 'darwin' ? `/private${expectedPath}` : expectedPath;

      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }).mockResolvedValueOnce({
        stdout: [
          'worktree /repo',
          'HEAD 111111',
          'branch refs/heads/main',
          '',
          `worktree ${reportedPath}`,
          'HEAD abc123',
          'branch refs/heads/my-branch',
          '',
        ].join('\n'),
        stderr: '',
      });

      const result = await service.create('/repo', 'my-branch', expectedPath);

      expect(result.path).toBe(reportedPath);
      expect(result.branch).toBe('my-branch');
    });
  });

  describe('remove', () => {
    it('should remove worktree with correct git command', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
      await service.remove('/repo', '/some/wt/path');
      expect(mockExecFile).toHaveBeenCalledWith('git', ['worktree', 'remove', '/some/wt/path'], {
        cwd: '/repo',
      });
    });

    it('should pass --force flag when force=true', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
      await service.remove('/repo', '/some/wt/path', true);
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '--force', '/some/wt/path'],
        { cwd: '/repo' }
      );
    });

    it('should not pass --force flag when force=false', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
      await service.remove('/repo', '/some/wt/path', false);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['worktree', 'remove', '/some/wt/path'], {
        cwd: '/repo',
      });
    });

    it('should not pass --force flag when force is omitted', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
      await service.remove('/repo', '/some/wt/path');
      const call = mockExecFile.mock.calls[0];
      expect(call[1]).not.toContain('--force');
    });

    it('should throw WorktreeError on failure', async () => {
      mockExecFile.mockRejectedValue(new Error("fatal: '/path' is not a valid directory"));
      await expect(service.remove('/repo', '/path')).rejects.toThrow(WorktreeError);

      try {
        await service.remove('/repo', '/path');
      } catch (e) {
        expect(e).toBeInstanceOf(WorktreeError);
        expect((e as WorktreeError).code).toBe(WorktreeErrorCode.NOT_FOUND);
      }
    });
  });

  describe('list', () => {
    it('should parse git worktree list --porcelain output', async () => {
      mockExecFile.mockResolvedValue({
        stdout: [
          'worktree /repo',
          'HEAD abc123',
          'branch refs/heads/main',
          '',
          'worktree /some/wt/path',
          'HEAD def456',
          'branch refs/heads/feat/feature-1',
          '',
        ].join('\n'),
        stderr: '',
      });

      const worktrees = await service.list('/repo');

      expect(worktrees).toHaveLength(2);
      expect(worktrees[0]).toEqual({
        path: '/repo',
        head: 'abc123',
        branch: 'main',
        isMain: true,
      });
      expect(worktrees[1]).toEqual({
        path: '/some/wt/path',
        head: 'def456',
        branch: 'feat/feature-1',
        isMain: false,
      });
    });

    it('should handle empty list', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
      const worktrees = await service.list('/repo');
      expect(worktrees).toEqual([]);
    });

    it('should call git with correct arguments', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
      await service.list('/repo');
      expect(mockExecFile).toHaveBeenCalledWith('git', ['worktree', 'list', '--porcelain'], {
        cwd: '/repo',
      });
    });
  });

  describe('exists', () => {
    it('should return true when branch has a worktree', async () => {
      mockExecFile.mockResolvedValue({
        stdout: [
          'worktree /repo',
          'HEAD abc',
          'branch refs/heads/main',
          '',
          'worktree /w',
          'HEAD def',
          'branch refs/heads/feat/x',
          '',
        ].join('\n'),
        stderr: '',
      });

      const result = await service.exists('/repo', 'feat/x');
      expect(result).toBe(true);
    });

    it('should return false when branch has no worktree', async () => {
      mockExecFile.mockResolvedValue({
        stdout: ['worktree /repo', 'HEAD abc', 'branch refs/heads/main', ''].join('\n'),
        stderr: '',
      });

      const result = await service.exists('/repo', 'feat/x');
      expect(result).toBe(false);
    });
  });

  describe('branchExists', () => {
    it('should return true when branch exists in git', async () => {
      mockExecFile.mockResolvedValue({ stdout: '  feat/my-branch\n', stderr: '' });

      const result = await service.branchExists('/repo', 'feat/my-branch');

      expect(result).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('git', ['branch', '--list', 'feat/my-branch'], {
        cwd: '/repo',
      });
    });

    it('should return false when branch does not exist', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const result = await service.branchExists('/repo', 'feat/nonexistent');

      expect(result).toBe(false);
    });

    it('should return false when git command fails', async () => {
      mockExecFile.mockRejectedValue(new Error('not a git repository'));

      const result = await service.branchExists('/repo', 'feat/x');

      expect(result).toBe(false);
    });
  });

  describe('remoteBranchExists', () => {
    it('should return true when remote branch exists', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'abc123def456\trefs/heads/feat/my-branch\n',
        stderr: '',
      });

      const result = await service.remoteBranchExists('/repo', 'feat/my-branch');

      expect(result).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['ls-remote', '--heads', 'origin', 'feat/my-branch'],
        { cwd: '/repo' }
      );
    });

    it('should return false when remote branch does not exist', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const result = await service.remoteBranchExists('/repo', 'feat/nonexistent');

      expect(result).toBe(false);
    });

    it('should return false when git command fails (e.g., no remote)', async () => {
      mockExecFile.mockRejectedValue(new Error('fatal: could not read from remote'));

      const result = await service.remoteBranchExists('/repo', 'feat/x');

      expect(result).toBe(false);
    });
  });

  describe('ensureGitRepository', () => {
    it('should no-op for an existing git repository with commits', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: 'true\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });

      await service.ensureGitRepository('/existing/repo');

      expect(mockExecFile).toHaveBeenCalledWith('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: '/existing/repo',
      });
      expect(mockExecFile).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD'], {
        cwd: '/existing/repo',
      });
      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });

    it('should create directory recursively and run git init for a non-git directory', async () => {
      const { mkdirSync } = await import('node:fs');

      mockExecFile
        .mockRejectedValueOnce(new Error('fatal: not a git repository'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git init
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git config user.name
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git config user.email
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git add .
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git commit

      await service.ensureGitRepository('/plain/dir');

      expect(mkdirSync).toHaveBeenCalledWith('/plain/dir', { recursive: true });
      expect(mockExecFile).toHaveBeenCalledWith('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: '/plain/dir',
      });
      expect(mockExecFile).toHaveBeenCalledWith('git', ['init', '-b', 'main'], {
        cwd: '/plain/dir',
      });
      expect(mockExecFile).toHaveBeenCalledWith('git', ['config', 'user.name', 'shep-ai[bot]'], {
        cwd: '/plain/dir',
      });
      expect(mockExecFile).toHaveBeenCalledWith('git', ['config', 'user.email', 'bot@shep.bot'], {
        cwd: '/plain/dir',
      });
      expect(mockExecFile).toHaveBeenCalledWith('git', ['add', '.'], { cwd: '/plain/dir' });
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['commit', '--allow-empty', '--no-gpg-sign', '-m', 'Initial commit'],
        { cwd: '/plain/dir' }
      );
    });

    it('should create initial commit for existing repo with unborn branch (no commits)', async () => {
      mockExecFile
        // 1. rev-parse --is-inside-work-tree → succeeds (is a git repo)
        .mockResolvedValueOnce({ stdout: 'true\n', stderr: '' })
        // 2. rev-parse HEAD → fails (no commits, unborn branch)
        .mockRejectedValueOnce(new Error("fatal: ambiguous argument 'HEAD'"))
        // 3. git config user.name
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 4. git config user.email
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 5. git add .
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 6. git commit --allow-empty
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.ensureGitRepository('/empty/repo');

      expect(mockExecFile).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD'], {
        cwd: '/empty/repo',
      });
      expect(mockExecFile).toHaveBeenCalledWith('git', ['add', '.'], { cwd: '/empty/repo' });
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['commit', '--allow-empty', '--no-gpg-sign', '-m', 'Initial commit'],
        { cwd: '/empty/repo' }
      );
    });

    it('should not create initial commit for existing repo that already has commits', async () => {
      mockExecFile
        // 1. rev-parse --is-inside-work-tree → succeeds
        .mockResolvedValueOnce({ stdout: 'true\n', stderr: '' })
        // 2. rev-parse HEAD → succeeds (has commits)
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });

      await service.ensureGitRepository('/existing/repo');

      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });

    it('should throw WorktreeError when git init fails', async () => {
      mockExecFile
        .mockRejectedValueOnce(new Error('fatal: not a git repository'))
        .mockRejectedValueOnce(new Error('permission denied'));

      try {
        await service.ensureGitRepository('/bad/dir');
      } catch (e) {
        expect(e).toBeInstanceOf(WorktreeError);
        expect((e as WorktreeError).code).toBe(WorktreeErrorCode.GIT_ERROR);
      }
    });
  });

  describe('getWorktreePath', () => {
    it('should compute path under ~/.shep/repos/HASH/wt/SLUG', () => {
      const result = service.getWorktreePath('/home/user/repo', 'feat/my-feature');
      // Should NOT be inside the repo
      expect(result).not.toContain('/home/user/repo/');
      // Should be under ~/.shep/repos/
      expect(result).toContain('.shep/repos/');
      expect(result).toContain('/wt/');
      // Slashes in branch should be replaced with hyphens
      expect(result).toContain('feat-my-feature');
    });

    it('should produce consistent hash for same repo path', () => {
      const a = service.getWorktreePath('/my/repo', 'feat/a');
      const b = service.getWorktreePath('/my/repo', 'feat/b');
      // Same repo hash, different slug
      const aDir = a.split('/wt/')[0];
      const bDir = b.split('/wt/')[0];
      expect(aDir).toBe(bDir);
    });

    it('should produce different hashes for different repo paths', () => {
      const a = service.getWorktreePath('/repo-a', 'feat/x');
      const b = service.getWorktreePath('/repo-b', 'feat/x');
      expect(a).not.toBe(b);
    });
  });
});
