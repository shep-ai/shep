import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { GitRemoteService } from '@/infrastructure/services/git/git-remote.service.js';
import { GhNotAuthenticatedError } from '@/domain/errors/gh-not-authenticated.error.js';
import { GitRemoteCreationError } from '@/domain/errors/git-remote-creation.error.js';

interface ExecCall {
  file: string;
  args: string[];
}

interface FakeExecOptions {
  /** commands whose first arg matches this prefix (e.g. ['rev-parse','HEAD']) throw */
  missing?: { file: string; args: string[] }[];
  /** return value for gh auth token */
  ghAuthTokenStdout?: string;
  ghAuthTokenThrows?: boolean;
  ghRepoCreateError?: string;
  originUrl?: string;
}

function makeExec(options: FakeExecOptions) {
  const calls: ExecCall[] = [];
  const exec = vi.fn(async (file: string, args: string[]) => {
    calls.push({ file, args });

    if (file === 'gh' && args[0] === 'auth' && args[1] === 'token') {
      if (options.ghAuthTokenThrows) {
        throw new Error('gh: not authenticated');
      }
      return { stdout: options.ghAuthTokenStdout ?? 'ghs_token_xxx\n', stderr: '' };
    }

    if (file === 'gh' && args[0] === 'repo' && args[1] === 'create') {
      if (options.ghRepoCreateError) {
        throw new Error(options.ghRepoCreateError);
      }
      return { stdout: '', stderr: '' };
    }

    if (file === 'git' && args[0] === 'remote' && args[1] === 'get-url') {
      if (!options.originUrl) {
        throw new Error('fatal: No such remote or remote group: origin');
      }
      return { stdout: `${options.originUrl}\n`, stderr: '' };
    }

    if (options.missing) {
      for (const m of options.missing) {
        if (file === m.file && m.args.every((a, i) => args[i] === a)) {
          throw new Error(`missing: ${file} ${args.join(' ')}`);
        }
      }
    }

    return { stdout: '', stderr: '' };
  });
  return { exec, calls };
}

describe('GitRemoteService.isGhAuthenticated', () => {
  it('returns true when gh auth token succeeds with a non-empty token', async () => {
    const { exec } = makeExec({ ghAuthTokenStdout: 'ghs_abc\n' });
    const svc = new GitRemoteService(exec);
    expect(await svc.isGhAuthenticated()).toBe(true);
  });

  it('returns false when gh auth token stdout is empty', async () => {
    const { exec } = makeExec({ ghAuthTokenStdout: '\n' });
    const svc = new GitRemoteService(exec);
    expect(await svc.isGhAuthenticated()).toBe(false);
  });

  it('returns false when gh auth token throws', async () => {
    const { exec } = makeExec({ ghAuthTokenThrows: true });
    const svc = new GitRemoteService(exec);
    expect(await svc.isGhAuthenticated()).toBe(false);
  });
});

describe('GitRemoteService.createGitHubRepoAndPush', () => {
  const input = {
    cwd: '/tmp/app',
    slug: 'my-app',
    description: 'Example app',
  };

  it('happy path creates repo and returns the remote URL', async () => {
    let originExists = false;
    const exec = vi.fn(async (file: string, args: string[]) => {
      if (file === 'gh' && args[0] === 'auth' && args[1] === 'token') {
        return { stdout: 'ghs_abc\n', stderr: '' };
      }
      if (file === 'git' && args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') {
        return { stdout: '', stderr: '' };
      }
      if (file === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { stdout: '', stderr: '' };
      }
      if (file === 'git' && args[0] === 'remote' && args[1] === 'get-url') {
        if (!originExists) throw new Error('no origin');
        return { stdout: 'https://github.com/user/my-app\n', stderr: '' };
      }
      if (file === 'gh' && args[0] === 'repo' && args[1] === 'create') {
        originExists = true;
        return { stdout: '', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    const svc = new GitRemoteService(exec);
    const { remoteUrl } = await svc.createGitHubRepoAndPush(input);
    expect(remoteUrl).toBe('https://github.com/user/my-app');

    // Assert gh repo create was invoked with the slug + description
    const ghCall = exec.mock.calls.find(
      ([file, args]) => file === 'gh' && args[0] === 'repo' && args[1] === 'create'
    );
    expect(ghCall).toBeDefined();
    expect(ghCall![1]).toContain('my-app');
    expect(ghCall![1]).toContain('--description');
    expect(ghCall![1]).toContain('Example app');
    // Default visibility is `--private` so user code is never leaked to
    // the open internet without an explicit opt-in. Earlier versions
    // defaulted to --public and this test pinned that wrong default.
    expect(ghCall![1]).toContain('--private');
    expect(ghCall![1]).not.toContain('--public');
  });

  it('throws GhNotAuthenticatedError when gh auth token fails', async () => {
    const { exec } = makeExec({ ghAuthTokenThrows: true });
    const svc = new GitRemoteService(exec);
    await expect(svc.createGitHubRepoAndPush(input)).rejects.toBeInstanceOf(
      GhNotAuthenticatedError
    );
  });

  it('init is idempotent — does not call git init when inside a work tree', async () => {
    let originExists = false;
    const exec = vi.fn(async (file: string, args: string[]) => {
      if (file === 'gh' && args[0] === 'auth' && args[1] === 'token') {
        return { stdout: 'ghs_abc\n', stderr: '' };
      }
      if (file === 'git' && args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') {
        return { stdout: '', stderr: '' };
      }
      if (file === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { stdout: '', stderr: '' };
      }
      if (file === 'git' && args[0] === 'remote' && args[1] === 'get-url') {
        if (!originExists) throw new Error('no origin');
        return { stdout: 'https://github.com/user/my-app\n', stderr: '' };
      }
      if (file === 'gh' && args[0] === 'repo' && args[1] === 'create') {
        originExists = true;
        return { stdout: '', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    const svc = new GitRemoteService(exec);
    await svc.createGitHubRepoAndPush(input);
    const initCalls = exec.mock.calls.filter(
      ([file, args]) => file === 'git' && args[0] === 'init'
    );
    expect(initCalls).toHaveLength(0);
  });

  it('wraps gh repo create failures as GitRemoteCreationError', async () => {
    const exec = vi.fn(async (file: string, args: string[]) => {
      if (file === 'gh' && args[0] === 'auth' && args[1] === 'token') {
        return { stdout: 'ghs_abc\n', stderr: '' };
      }
      if (file === 'git' && args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') {
        return { stdout: '', stderr: '' };
      }
      if (file === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { stdout: '', stderr: '' };
      }
      if (file === 'git' && args[0] === 'remote' && args[1] === 'get-url') {
        throw new Error('no origin');
      }
      if (file === 'gh' && args[0] === 'repo' && args[1] === 'create') {
        throw new Error('rate limited');
      }
      return { stdout: '', stderr: '' };
    });

    const svc = new GitRemoteService(exec);
    await expect(svc.createGitHubRepoAndPush(input)).rejects.toBeInstanceOf(GitRemoteCreationError);
  });

  it('maps gh auth-related failures back to GhNotAuthenticatedError', async () => {
    const exec = vi.fn(async (file: string, args: string[]) => {
      if (file === 'gh' && args[0] === 'auth' && args[1] === 'token') {
        return { stdout: 'ghs_abc\n', stderr: '' };
      }
      if (file === 'git' && args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') {
        return { stdout: '', stderr: '' };
      }
      if (file === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { stdout: '', stderr: '' };
      }
      if (file === 'git' && args[0] === 'remote' && args[1] === 'get-url') {
        throw new Error('no origin');
      }
      if (file === 'gh' && args[0] === 'repo' && args[1] === 'create') {
        throw new Error('gh: To authenticate, run `gh auth login`');
      }
      return { stdout: '', stderr: '' };
    });

    const svc = new GitRemoteService(exec);
    await expect(svc.createGitHubRepoAndPush(input)).rejects.toBeInstanceOf(
      GhNotAuthenticatedError
    );
  });
});
