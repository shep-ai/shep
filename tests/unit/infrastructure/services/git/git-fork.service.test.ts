/**
 * GitForkService Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitForkService } from '@/infrastructure/services/git/git-fork.service';
import {
  GitForkError,
  GitForkErrorCode,
} from '@/application/ports/output/services/git-fork-service.interface';
import { PrStatus } from '@/domain/generated/output';
import { PR_BRANDING } from '@/infrastructure/services/git/pr-branding';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service';

describe('GitForkService', () => {
  let mockExec: ExecFunction;
  let service: GitForkService;

  beforeEach(() => {
    mockExec = vi.fn();
    service = new GitForkService(mockExec);
  });

  describe('forkRepository', () => {
    it('should fork the repo and remap remotes on happy path', async () => {
      // gh repo view returns non-fork
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify({ isFork: false }),
        stderr: '',
      });
      // gh repo fork succeeds
      vi.mocked(mockExec).mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.forkRepository('/repo');

      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        ['repo', 'fork', '--remote', '--remote-name', 'origin'],
        { cwd: '/repo' }
      );
    });

    it('should detect origin is already a fork and set upstream to parent', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify({
          isFork: true,
          parent: { owner: { login: 'upstream-owner' }, name: 'upstream-repo' },
        }),
        stderr: '',
      });
      // git remote add upstream succeeds
      vi.mocked(mockExec).mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.forkRepository('/repo');

      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['remote', 'add', 'upstream', 'https://github.com/upstream-owner/upstream-repo.git'],
        { cwd: '/repo' }
      );
      // Should NOT call gh repo fork
      expect(mockExec).not.toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['repo', 'fork']),
        expect.anything()
      );
    });

    it('should update upstream URL when remote already exists for a fork origin', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify({
          isFork: true,
          parent: { owner: { login: 'upstream-owner' }, name: 'upstream-repo' },
        }),
        stderr: '',
      });
      // git remote add fails (remote already exists)
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('remote upstream already exists'));
      // git remote set-url succeeds
      vi.mocked(mockExec).mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.forkRepository('/repo');

      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['remote', 'set-url', 'upstream', 'https://github.com/upstream-owner/upstream-repo.git'],
        { cwd: '/repo' }
      );
    });

    it('should throw AUTH_FAILURE when gh auth fails', async () => {
      // gh repo view fails
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('not a repo'));
      // gh repo fork fails with auth error
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('auth login required'));

      const error = await service.forkRepository('/repo').catch((e) => e);
      expect(error).toBeInstanceOf(GitForkError);
      expect(error.code).toBe(GitForkErrorCode.AUTH_FAILURE);
    });

    it('should throw FORK_FAILED for generic fork errors', async () => {
      // gh repo view fails
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('not a repo'));
      // gh repo fork fails with generic error
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('network timeout'));

      const error = await service.forkRepository('/repo').catch((e) => e);
      expect(error).toBeInstanceOf(GitForkError);
      expect(error.code).toBe(GitForkErrorCode.FORK_FAILED);
    });

    it('should fallback to gh repo create when fork fails with no remotes', async () => {
      // gh repo view fails (no remotes)
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('not a repo'));
      // gh repo fork fails with "no git remotes found"
      vi.mocked(mockExec).mockRejectedValueOnce(
        new Error('unable to determine base repository: no git remotes found')
      );
      // gh api user returns username
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'testuser\n',
        stderr: '',
      });
      // gh repo create succeeds
      vi.mocked(mockExec).mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.forkRepository('/path/to/my-project');

      expect(mockExec).toHaveBeenCalledWith('gh', ['api', 'user', '--jq', '.login'], {
        cwd: '/path/to/my-project',
      });
      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        [
          'repo',
          'create',
          'testuser/my-project',
          '--source',
          '.',
          '--remote',
          'origin',
          '--private',
        ],
        { cwd: '/path/to/my-project' }
      );
    });

    it('should fallback to gh repo create when fork fails with unable to determine base repository', async () => {
      // gh repo view fails
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('not a repo'));
      // gh repo fork fails with "unable to determine base repository"
      vi.mocked(mockExec).mockRejectedValueOnce(
        new Error('unable to determine base repository: some other reason')
      );
      // gh api user returns username
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'myuser\n',
        stderr: '',
      });
      // gh repo create succeeds
      vi.mocked(mockExec).mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.forkRepository('/workspace/cool-repo');

      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        ['repo', 'create', 'myuser/cool-repo', '--source', '.', '--remote', 'origin', '--private'],
        { cwd: '/workspace/cool-repo' }
      );
    });

    it('should throw FORK_FAILED when both fork and create fallback fail', async () => {
      // gh repo view fails
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('not a repo'));
      // gh repo fork fails with no remotes
      vi.mocked(mockExec).mockRejectedValueOnce(
        new Error('unable to determine base repository: no git remotes found')
      );
      // gh api user succeeds
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'testuser\n',
        stderr: '',
      });
      // gh repo create fails
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('repo already exists'));

      const error = await service.forkRepository('/repo').catch((e) => e);
      expect(error).toBeInstanceOf(GitForkError);
      expect(error.code).toBe(GitForkErrorCode.FORK_FAILED);
      expect(error.message).toContain('repo already exists');
    });
  });

  describe('pushToFork', () => {
    it('should push branch to origin', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.pushToFork('/repo', 'feat/my-branch');

      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['push', '-u', 'origin', '--', 'feat/my-branch'],
        {
          cwd: '/repo',
        }
      );
    });

    it('should throw PUSH_FAILED on error', async () => {
      vi.mocked(mockExec).mockImplementation(async (cmd) => {
        if (cmd === 'git') throw new Error('push rejected');
        return { stdout: '', stderr: '' };
      });

      const error = await service.pushToFork('/repo', 'feat/my-branch').catch((e) => e);
      expect(error).toBeInstanceOf(GitForkError);
      expect(error.code).toBe(GitForkErrorCode.PUSH_FAILED);
    });

    it('should wire gh as the git credential helper before pushing', async () => {
      vi.mocked(mockExec).mockResolvedValue({ stdout: '', stderr: '' });

      await service.pushToFork('/repo', 'feat/my-branch');

      expect(vi.mocked(mockExec).mock.calls).toEqual([
        ['gh', ['auth', 'setup-git'], { cwd: '/repo' }],
        ['git', ['push', '-u', 'origin', '--', 'feat/my-branch'], { cwd: '/repo' }],
      ]);
    });

    it('should still push when gh auth setup-git fails (best-effort)', async () => {
      vi.mocked(mockExec).mockImplementation(async (cmd) => {
        if (cmd === 'gh') throw new Error('gh: not logged in');
        return { stdout: '', stderr: '' };
      });

      await expect(service.pushToFork('/repo', 'feat/my-branch')).resolves.toBeUndefined();
      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['push', '-u', 'origin', '--', 'feat/my-branch'],
        { cwd: '/repo' }
      );
    });

    it('should not rewrite the origin remote URL', async () => {
      vi.mocked(mockExec).mockResolvedValue({ stdout: '', stderr: '' });

      await service.pushToFork('/repo', 'feat/my-branch');

      const remoteCalls = vi
        .mocked(mockExec)
        .mock.calls.filter(([cmd, args]) => cmd === 'git' && args[0] === 'remote');
      expect(remoteCalls).toEqual([]);
    });
  });

  describe('createUpstreamPr', () => {
    it('should create PR to upstream repo', async () => {
      // git remote get-url upstream
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'https://github.com/upstream-owner/upstream-repo.git\n',
        stderr: '',
      });
      // git remote get-url origin
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'https://github.com/fork-owner/upstream-repo.git\n',
        stderr: '',
      });
      // gh pr create
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify({
          url: 'https://github.com/upstream-owner/upstream-repo/pull/42',
          number: 42,
        }),
        stderr: '',
      });

      const result = await service.createUpstreamPr(
        '/repo',
        'feat: add feature',
        'PR body',
        'feat/my-branch',
        'main'
      );

      expect(result).toEqual({
        url: 'https://github.com/upstream-owner/upstream-repo/pull/42',
        number: 42,
      });

      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        [
          'pr',
          'create',
          '--repo',
          'upstream-owner/upstream-repo',
          '--title',
          'feat: add feature',
          '--body',
          expect.stringContaining(PR_BRANDING),
          '--head',
          'fork-owner:feat/my-branch',
          '--base',
          'main',
          '--json',
          'url,number',
        ],
        { cwd: '/repo' }
      );
    });

    it('should handle SSH remote URLs', async () => {
      // git remote get-url upstream (SSH format)
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'git@github.com:upstream-owner/upstream-repo.git\n',
        stderr: '',
      });
      // git remote get-url origin (SSH format)
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'git@github.com:fork-owner/upstream-repo.git\n',
        stderr: '',
      });
      // gh pr create
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify({
          url: 'https://github.com/upstream-owner/upstream-repo/pull/1',
          number: 1,
        }),
        stderr: '',
      });

      const result = await service.createUpstreamPr('/repo', 'title', 'body', 'feat/x', 'main');

      expect(result.number).toBe(1);
      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          '--repo',
          'upstream-owner/upstream-repo',
          '--body',
          expect.stringContaining(PR_BRANDING),
        ]),
        { cwd: '/repo' }
      );
    });

    it('should throw PR_CREATE_FAILED on error', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'https://github.com/owner/repo.git\n',
        stderr: '',
      });
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'https://github.com/fork/repo.git\n',
        stderr: '',
      });
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('PR creation failed'));

      const error = await service
        .createUpstreamPr('/repo', 'title', 'body', 'branch', 'main')
        .catch((e) => e);
      expect(error).toBeInstanceOf(GitForkError);
      expect(error.code).toBe(GitForkErrorCode.PR_CREATE_FAILED);
    });
  });

  describe('getUpstreamPrStatus', () => {
    it('should return Open for open PR', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify({ state: 'OPEN' }),
        stderr: '',
      });

      const result = await service.getUpstreamPrStatus('owner/repo', 42);

      expect(result).toBe(PrStatus.Open);
      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        ['pr', 'view', '42', '--repo', 'owner/repo', '--json', 'state'],
        {}
      );
    });

    it('should return Merged for merged PR', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify({ state: 'MERGED' }),
        stderr: '',
      });

      const result = await service.getUpstreamPrStatus('owner/repo', 10);
      expect(result).toBe(PrStatus.Merged);
    });

    it('should return Closed for closed PR', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: JSON.stringify({ state: 'CLOSED' }),
        stderr: '',
      });

      const result = await service.getUpstreamPrStatus('owner/repo', 10);
      expect(result).toBe(PrStatus.Closed);
    });

    it('should throw PR_STATUS_FAILED on error', async () => {
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('not found'));

      const error = await service.getUpstreamPrStatus('owner/repo', 99).catch((e) => e);
      expect(error).toBeInstanceOf(GitForkError);
      expect(error.code).toBe(GitForkErrorCode.PR_STATUS_FAILED);
    });
  });
});
