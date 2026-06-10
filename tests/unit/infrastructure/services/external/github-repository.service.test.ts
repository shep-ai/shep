/**
 * GitHubRepositoryService Unit Tests
 *
 * Tests for auth check, repo listing, URL parsing, and clone operations
 * using mocked ExecFunction and spawn.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { EventEmitter } from 'node:events';
import { GitHubRepositoryService } from '@/infrastructure/services/external/github-repository.service.js';
import {
  GitHubAuthError,
  GitHubCloneError,
  GitHubForkError,
  GitHubPermissionError,
  GitHubRepoListError,
  GitHubUrlParseError,
} from '@/application/ports/output/services/github-repository-service.interface.js';

// Mock child_process.spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises.rm
vi.mock('node:fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

const mockSpawn = spawn as unknown as Mock;
const mockRm = rm as unknown as Mock;

describe('GitHubRepositoryService', () => {
  let service: GitHubRepositoryService;
  let mockExecFile: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile = vi.fn();
    service = new GitHubRepositoryService(mockExecFile as any);
  });

  // -------------------------------------------------------------------------
  // checkAuth
  // -------------------------------------------------------------------------

  describe('checkAuth()', () => {
    it('should succeed when gh auth token exits 0', async () => {
      mockExecFile.mockResolvedValue({ stdout: 'gho_xxxx', stderr: '' });

      await expect(service.checkAuth()).resolves.toBeUndefined();
      expect(mockExecFile).toHaveBeenCalledWith('gh', ['auth', 'token']);
    });

    it('should throw GitHubAuthError when gh auth token fails', async () => {
      mockExecFile.mockRejectedValue(new Error('not logged in'));

      await expect(service.checkAuth()).rejects.toThrow(GitHubAuthError);
      await expect(service.checkAuth()).rejects.toThrow('not authenticated');
    });

    it('should throw GitHubAuthError with specific message when gh is not installed', async () => {
      const err = new Error('spawn gh ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockExecFile.mockRejectedValue(err);

      await expect(service.checkAuth()).rejects.toThrow(GitHubAuthError);
      await expect(service.checkAuth()).rejects.toThrow('not installed');
    });
  });

  // -------------------------------------------------------------------------
  // listUserRepositories
  // -------------------------------------------------------------------------

  describe('listUserRepositories()', () => {
    const sampleRepos = [
      {
        name: 'my-project',
        nameWithOwner: 'octocat/my-project',
        description: 'A sample project',
        isPrivate: false,
        pushedAt: '2024-01-15T10:30:00Z',
      },
      {
        name: 'secret-project',
        nameWithOwner: 'octocat/secret-project',
        description: '',
        isPrivate: true,
        pushedAt: '2024-01-14T08:00:00Z',
      },
    ];

    it('should parse JSON output from gh repo list', async () => {
      mockExecFile.mockResolvedValue({ stdout: JSON.stringify(sampleRepos), stderr: '' });

      const result = await service.listUserRepositories();

      expect(result).toEqual(sampleRepos);
      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          'repo',
          'list',
          '--json',
          'name,nameWithOwner,description,isPrivate,pushedAt',
        ])
      );
    });

    it('should pass --limit flag', async () => {
      mockExecFile.mockResolvedValue({ stdout: '[]', stderr: '' });

      await service.listUserRepositories({ limit: 10 });

      expect(mockExecFile).toHaveBeenCalledWith('gh', expect.arrayContaining(['--limit', '10']));
    });

    it('should use default limit of 30', async () => {
      mockExecFile.mockResolvedValue({ stdout: '[]', stderr: '' });

      await service.listUserRepositories();

      expect(mockExecFile).toHaveBeenCalledWith('gh', expect.arrayContaining(['--limit', '30']));
    });

    it('should pass -q jq filter when search is provided', async () => {
      mockExecFile.mockResolvedValue({ stdout: '[]', stderr: '' });

      await service.listUserRepositories({ search: 'my-proj' });

      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['-q', '[.[] | select(.name | test("my-proj"; "i"))]'])
      );
    });

    it('should throw GitHubRepoListError on failure', async () => {
      mockExecFile.mockRejectedValue(new Error('network error'));

      await expect(service.listUserRepositories()).rejects.toThrow(GitHubRepoListError);
    });

    it('should throw GitHubRepoListError when gh is not installed', async () => {
      const err = new Error('spawn gh ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockExecFile.mockRejectedValue(err);

      await expect(service.listUserRepositories()).rejects.toThrow(GitHubRepoListError);
      await expect(service.listUserRepositories()).rejects.toThrow('not installed');
    });

    it('should pass owner as positional arg when provided', async () => {
      mockExecFile.mockResolvedValue({ stdout: '[]', stderr: '' });

      await service.listUserRepositories({ owner: 'my-org' });

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args[0]).toBe('repo');
      expect(args[1]).toBe('list');
      expect(args[2]).toBe('my-org');
    });

    it('should not include owner arg when owner is undefined', async () => {
      mockExecFile.mockResolvedValue({ stdout: '[]', stderr: '' });

      await service.listUserRepositories();

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args[0]).toBe('repo');
      expect(args[1]).toBe('list');
      expect(args[2]).toBe('--json');
    });
  });

  // -------------------------------------------------------------------------
  // listOrganizations
  // -------------------------------------------------------------------------

  describe('listOrganizations()', () => {
    const sampleOrgs = [
      { login: 'org-a', description: 'Organization A' },
      { login: 'org-b', description: '' },
    ];

    it('should parse JSON output from gh api /user/orgs', async () => {
      mockExecFile.mockResolvedValue({ stdout: JSON.stringify(sampleOrgs), stderr: '' });

      const result = await service.listOrganizations();

      expect(result).toEqual(sampleOrgs);
      expect(mockExecFile).toHaveBeenCalledWith('gh', [
        'api',
        '/user/orgs',
        '--jq',
        '[.[] | {login: .login, description: (.description // "")}]',
      ]);
    });

    it('should return empty array when user has no orgs', async () => {
      mockExecFile.mockResolvedValue({ stdout: '[]', stderr: '' });

      const result = await service.listOrganizations();

      expect(result).toEqual([]);
    });

    it('should throw GitHubRepoListError on failure', async () => {
      mockExecFile.mockRejectedValue(new Error('network error'));

      await expect(service.listOrganizations()).rejects.toThrow(GitHubRepoListError);
    });

    it('should throw GitHubRepoListError when gh is not installed', async () => {
      const err = new Error('spawn gh ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockExecFile.mockRejectedValue(err);

      await expect(service.listOrganizations()).rejects.toThrow(GitHubRepoListError);
      await expect(service.listOrganizations()).rejects.toThrow('not installed');
    });
  });

  // -------------------------------------------------------------------------
  // parseGitHubUrl
  // -------------------------------------------------------------------------

  describe('parseGitHubUrl()', () => {
    it('should parse https://github.com/owner/repo', () => {
      const result = service.parseGitHubUrl('https://github.com/octocat/hello-world');

      expect(result).toEqual({
        owner: 'octocat',
        repo: 'hello-world',
        nameWithOwner: 'octocat/hello-world',
      });
    });

    it('should parse https://github.com/owner/repo.git', () => {
      const result = service.parseGitHubUrl('https://github.com/octocat/hello-world.git');

      expect(result).toEqual({
        owner: 'octocat',
        repo: 'hello-world',
        nameWithOwner: 'octocat/hello-world',
      });
    });

    it('should parse git@github.com:owner/repo.git', () => {
      const result = service.parseGitHubUrl('git@github.com:octocat/hello-world.git');

      expect(result).toEqual({
        owner: 'octocat',
        repo: 'hello-world',
        nameWithOwner: 'octocat/hello-world',
      });
    });

    it('should parse owner/repo shorthand', () => {
      const result = service.parseGitHubUrl('octocat/hello-world');

      expect(result).toEqual({
        owner: 'octocat',
        repo: 'hello-world',
        nameWithOwner: 'octocat/hello-world',
      });
    });

    it('should throw GitHubUrlParseError for non-GitHub URLs', () => {
      expect(() => service.parseGitHubUrl('https://gitlab.com/owner/repo')).toThrow(
        GitHubUrlParseError
      );
    });

    it('should throw GitHubUrlParseError for malformed input', () => {
      expect(() => service.parseGitHubUrl('not-a-url')).toThrow(GitHubUrlParseError);
    });

    it('should throw GitHubUrlParseError for empty input', () => {
      expect(() => service.parseGitHubUrl('')).toThrow(GitHubUrlParseError);
    });

    it('should throw GitHubUrlParseError for whitespace-only input', () => {
      expect(() => service.parseGitHubUrl('  ')).toThrow(GitHubUrlParseError);
    });

    it('should handle URLs with trailing whitespace', () => {
      const result = service.parseGitHubUrl('  https://github.com/octocat/hello-world  ');

      expect(result.nameWithOwner).toBe('octocat/hello-world');
    });

    it('should handle owner/repo with dots and underscores', () => {
      const result = service.parseGitHubUrl('my_org.inc/my.repo_v2');

      expect(result).toEqual({
        owner: 'my_org.inc',
        repo: 'my.repo_v2',
        nameWithOwner: 'my_org.inc/my.repo_v2',
      });
    });
  });

  // -------------------------------------------------------------------------
  // cloneRepository
  // -------------------------------------------------------------------------

  describe('cloneRepository()', () => {
    function createMockChildProcess() {
      const cp = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      cp.stdout = new EventEmitter();
      cp.stderr = new EventEmitter();
      return cp;
    }

    it('should spawn gh with correct args', async () => {
      const child = createMockChildProcess();
      mockSpawn.mockReturnValue(child);

      const promise = service.cloneRepository('octocat/hello-world', '/tmp/hello-world');

      // Simulate successful clone
      child.emit('close', 0);
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'gh',
        ['repo', 'clone', 'octocat/hello-world', expect.any(String)],
        expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] })
      );
    });

    it('should resolve on exit code 0', async () => {
      const child = createMockChildProcess();
      mockSpawn.mockReturnValue(child);

      const promise = service.cloneRepository('octocat/hello-world', '/tmp/hello-world');
      child.emit('close', 0);

      await expect(promise).resolves.toBeUndefined();
    });

    it('should reject with GitHubCloneError on non-zero exit', async () => {
      const child = createMockChildProcess();
      mockSpawn.mockReturnValue(child);

      const promise = service.cloneRepository('octocat/hello-world', '/tmp/hello-world');
      child.stderr.emit('data', Buffer.from('fatal: repo not found'));
      child.emit('close', 128);

      await expect(promise).rejects.toThrow(GitHubCloneError);
    });

    it('should call onProgress with stderr data', async () => {
      const child = createMockChildProcess();
      mockSpawn.mockReturnValue(child);
      const onProgress = vi.fn();

      const promise = service.cloneRepository('octocat/hello-world', '/tmp/hello-world', {
        onProgress,
      });

      child.stderr.emit('data', Buffer.from('Receiving objects: 50%'));
      child.stderr.emit('data', Buffer.from('Receiving objects: 100%'));
      child.emit('close', 0);

      await promise;

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith('Receiving objects: 50%');
      expect(onProgress).toHaveBeenCalledWith('Receiving objects: 100%');
    });

    it('should reject with GitHubCloneError for path traversal in destination', async () => {
      await expect(
        service.cloneRepository('octocat/hello-world', '/tmp/../etc/passwd')
      ).rejects.toThrow(GitHubCloneError);
      await expect(
        service.cloneRepository('octocat/hello-world', '/tmp/../etc/passwd')
      ).rejects.toThrow('path traversal');
    });

    it('should clean up partial clone on failure', async () => {
      const child = createMockChildProcess();
      mockSpawn.mockReturnValue(child);

      const promise = service.cloneRepository('octocat/hello-world', '/tmp/hello-world');
      child.emit('close', 1);

      await expect(promise).rejects.toThrow(GitHubCloneError);
      expect(mockRm).toHaveBeenCalledWith(expect.any(String), {
        recursive: true,
        force: true,
      });
    });

    it('should handle spawn error event', async () => {
      const child = createMockChildProcess();
      mockSpawn.mockReturnValue(child);

      const promise = service.cloneRepository('octocat/hello-world', '/tmp/hello-world');
      child.emit('error', new Error('spawn ENOENT'));

      await expect(promise).rejects.toThrow(GitHubCloneError);
      expect(mockRm).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getAuthenticatedUser
  // -------------------------------------------------------------------------

  describe('getAuthenticatedUser()', () => {
    it('should return the authenticated user login', async () => {
      mockExecFile.mockResolvedValue({ stdout: 'octocat\n', stderr: '' });

      const result = await service.getAuthenticatedUser();

      expect(result).toBe('octocat');
      expect(mockExecFile).toHaveBeenCalledWith('gh', ['api', 'user', '--jq', '.login']);
    });

    it('should throw GitHubAuthError when gh is not installed', async () => {
      const err = new Error('spawn gh ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockExecFile.mockRejectedValue(err);

      await expect(service.getAuthenticatedUser()).rejects.toThrow(GitHubAuthError);
      await expect(service.getAuthenticatedUser()).rejects.toThrow(
        'Failed to get authenticated user'
      );
    });

    it('should throw GitHubAuthError when not authenticated', async () => {
      mockExecFile.mockRejectedValue(new Error('not logged in'));

      await expect(service.getAuthenticatedUser()).rejects.toThrow(GitHubAuthError);
    });
  });

  // -------------------------------------------------------------------------
  // checkPushAccess
  // -------------------------------------------------------------------------

  describe('checkPushAccess()', () => {
    it('should return hasPushAccess true when user has push permissions', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: 'octocat\n', stderr: '' }) // getAuthenticatedUser
        .mockResolvedValueOnce({ stdout: 'true\n', stderr: '' }); // gh api repos/...

      const result = await service.checkPushAccess('octocat/hello-world');

      expect(result.hasPushAccess).toBe(true);
      expect(result.viewerLogin).toBe('octocat');
    });

    it('should return hasPushAccess false when user lacks push permissions', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: 'myuser\n', stderr: '' }) // getAuthenticatedUser
        .mockResolvedValueOnce({ stdout: 'false\n', stderr: '' }); // gh api repos/...

      const result = await service.checkPushAccess('octocat/hello-world');

      expect(result.hasPushAccess).toBe(false);
      expect(result.viewerLogin).toBe('myuser');
    });

    it('should throw GitHubPermissionError when API call fails', async () => {
      mockExecFile
        .mockResolvedValueOnce({ stdout: 'myuser\n', stderr: '' }) // getAuthenticatedUser
        .mockRejectedValueOnce(new Error('Not Found')); // gh api repos/...

      await expect(service.checkPushAccess('private/repo')).rejects.toThrow(GitHubPermissionError);
    });
  });

  // -------------------------------------------------------------------------
  // forkRepository
  // -------------------------------------------------------------------------

  describe('forkRepository()', () => {
    it('should fork successfully and detect new fork', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'https://github.com/myuser/hello-world\n',
        stderr: '',
      });

      const result = await service.forkRepository('octocat/hello-world');

      expect(result.nameWithOwner).toBe('myuser/hello-world');
      expect(result.alreadyExisted).toBe(false);
      expect(mockExecFile).toHaveBeenCalledWith('gh', [
        'repo',
        'fork',
        'octocat/hello-world',
        '--clone=false',
      ]);
    });

    it('should detect already-existing fork', async () => {
      mockExecFile.mockResolvedValue({
        stdout: '',
        stderr: 'https://github.com/myuser/hello-world already exists\n',
      });

      const result = await service.forkRepository('octocat/hello-world');

      expect(result.alreadyExisted).toBe(true);
      expect(result.nameWithOwner).toBe('myuser/hello-world');
    });

    it('should throw GitHubForkError on execFile failure', async () => {
      mockExecFile.mockRejectedValue(new Error('unable to fork'));

      await expect(service.forkRepository('octocat/hello-world')).rejects.toThrow(GitHubForkError);
    });

    it('should call onProgress with fork status messages', async () => {
      mockExecFile.mockResolvedValue({
        stdout: 'https://github.com/myuser/hello-world\n',
        stderr: '',
      });
      const onProgress = vi.fn();

      await service.forkRepository('octocat/hello-world', { onProgress });

      expect(onProgress).toHaveBeenCalledWith('Forking octocat/hello-world...');
      expect(onProgress).toHaveBeenCalledWith('Fork created');
    });

    it('should throw GitHubForkError on ENOENT', async () => {
      const err = new Error('spawn ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockExecFile.mockRejectedValue(err);

      await expect(service.forkRepository('octocat/hello-world')).rejects.toThrow(GitHubForkError);
    });
  });
});
