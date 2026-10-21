import { describe, it, expect, vi } from 'vitest';
import { setupGhGitCredentials } from '@/infrastructure/services/git/gh-credential-helper';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service';

describe('setupGhGitCredentials', () => {
  it('runs gh auth setup-git in the given directory', async () => {
    const exec = vi.fn<ExecFunction>().mockResolvedValue({ stdout: '', stderr: '' });

    await expect(setupGhGitCredentials(exec, '/repo')).resolves.toEqual({ ok: true });
    expect(exec).toHaveBeenCalledWith('gh', ['auth', 'setup-git'], { cwd: '/repo' });
  });

  it('returns the failure instead of throwing', async () => {
    const exec = vi.fn<ExecFunction>().mockRejectedValue(new Error('gh: not logged in'));

    await expect(setupGhGitCredentials(exec, '/repo')).resolves.toEqual({
      ok: false,
      error: 'gh: not logged in',
    });
  });
});
