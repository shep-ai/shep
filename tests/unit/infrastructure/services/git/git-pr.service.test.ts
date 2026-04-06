/**
 * GitPrService Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitPrService } from '@/infrastructure/services/git/git-pr.service';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface';
import { PrStatus } from '@/domain/generated/output';
import { PR_BRANDING } from '@/infrastructure/services/git/pr-branding';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<object>('node:fs');
  return { ...actual, readFileSync: vi.fn() };
});

import { readFileSync } from 'node:fs';

describe('GitPrService', () => {
  let mockExec: ExecFunction;
  let service: GitPrService;

  beforeEach(() => {
    mockExec = vi.fn();
    service = new GitPrService(mockExec);
  });

  describe('getDefaultBranch', () => {
    it('should return branch from remote HEAD when available', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'refs/remotes/origin/develop\n',
        stderr: '',
      });

      const result = await service.getDefaultBranch('/repo');
      expect(result).toBe('develop');
    });

    it('should fall back to local main branch when remote HEAD fails', async () => {
      vi.mocked(mockExec)
        .mockRejectedValueOnce(new Error('not found')) // remote HEAD
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // refs/heads/main exists
        .mockRejectedValueOnce(new Error('not found')); // refs/heads/master does not exist

      const result = await service.getDefaultBranch('/repo');
      expect(result).toBe('main');
    });

    it('should fall back to local master branch when main does not exist', async () => {
      vi.mocked(mockExec)
        .mockRejectedValueOnce(new Error('not found')) // remote HEAD
        .mockRejectedValueOnce(new Error('not found')) // refs/heads/main
        .mockResolvedValueOnce({ stdout: 'def456\n', stderr: '' }); // refs/heads/master exists

      const result = await service.getDefaultBranch('/repo');
      expect(result).toBe('master');
    });

    it('should pick most recently committed branch when both main and master exist', async () => {
      vi.mocked(mockExec)
        .mockRejectedValueOnce(new Error('not found')) // remote HEAD
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // refs/heads/main exists
        .mockResolvedValueOnce({ stdout: 'def456\n', stderr: '' }) // refs/heads/master exists
        .mockResolvedValueOnce({ stdout: 'master\nmain\n', stderr: '' }); // for-each-ref: master is newer

      const result = await service.getDefaultBranch('/repo');
      expect(result).toBe('master');
    });

    it('should fall back to git config init.defaultBranch', async () => {
      vi.mocked(mockExec)
        .mockRejectedValueOnce(new Error('not found')) // remote HEAD
        .mockRejectedValueOnce(new Error('not found')) // refs/heads/main
        .mockRejectedValueOnce(new Error('not found')) // refs/heads/master
        .mockResolvedValueOnce({ stdout: 'trunk\n', stderr: '' }); // git config init.defaultBranch

      const result = await service.getDefaultBranch('/repo');
      expect(result).toBe('trunk');
    });

    it('should NOT use current branch when in a feature worktree', async () => {
      vi.mocked(mockExec)
        .mockRejectedValueOnce(new Error('not found')) // remote HEAD
        .mockRejectedValueOnce(new Error('not found')) // refs/heads/main
        .mockRejectedValueOnce(new Error('not found')) // refs/heads/master
        .mockRejectedValueOnce(new Error('not configured')) // git config init.defaultBranch
        .mockResolvedValueOnce({ stdout: '.git/worktrees/feat-branch\n', stderr: '' }) // git-dir
        .mockResolvedValueOnce({ stdout: '/repo/.git\n', stderr: '' }); // git-common-dir (differs = worktree)

      await expect(service.getDefaultBranch('/repo')).rejects.toThrow(
        'Unable to determine default branch'
      );
    });

    it('should use current branch in main worktree as last resort', async () => {
      vi.mocked(mockExec)
        .mockRejectedValueOnce(new Error('not found')) // remote HEAD
        .mockRejectedValueOnce(new Error('not found')) // refs/heads/main
        .mockRejectedValueOnce(new Error('not found')) // refs/heads/master
        .mockRejectedValueOnce(new Error('not configured')) // git config init.defaultBranch
        .mockResolvedValueOnce({ stdout: '.git\n', stderr: '' }) // git-dir
        .mockResolvedValueOnce({ stdout: '.git\n', stderr: '' }) // git-common-dir (same = main worktree)
        .mockResolvedValueOnce({ stdout: 'develop\n', stderr: '' }); // symbolic-ref HEAD

      const result = await service.getDefaultBranch('/repo');
      expect(result).toBe('develop');
    });

    it('should throw when all fallbacks fail', async () => {
      vi.mocked(mockExec)
        .mockRejectedValueOnce(new Error('not found')) // remote HEAD
        .mockRejectedValueOnce(new Error('not found')) // refs/heads/main
        .mockRejectedValueOnce(new Error('not found')) // refs/heads/master
        .mockRejectedValueOnce(new Error('not configured')) // git config init.defaultBranch
        .mockRejectedValueOnce(new Error('git error')); // git-dir fails

      await expect(service.getDefaultBranch('/repo')).rejects.toThrow(
        'Unable to determine default branch'
      );
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return true when git status has output', async () => {
      vi.mocked(mockExec).mockResolvedValue({
        stdout: ' M src/file.ts\n',
        stderr: '',
      });

      const result = await service.hasUncommittedChanges('/repo');

      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('git', ['status', '--porcelain'], { cwd: '/repo' });
    });

    it('should return false when git status is empty', async () => {
      vi.mocked(mockExec).mockResolvedValue({
        stdout: '',
        stderr: '',
      });

      const result = await service.hasUncommittedChanges('/repo');

      expect(result).toBe(false);
    });

    it('should return false when git status is whitespace only', async () => {
      vi.mocked(mockExec).mockResolvedValue({
        stdout: '  \n',
        stderr: '',
      });

      const result = await service.hasUncommittedChanges('/repo');

      expect(result).toBe(false);
    });
  });

  describe('commitAll', () => {
    it('should stage all changes, commit, and return SHA', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git add -A
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git commit
        .mockResolvedValueOnce({ stdout: 'abc123def456\n', stderr: '' }); // git rev-parse HEAD

      const sha = await service.commitAll('/repo', 'feat: add feature');

      expect(sha).toBe('abc123def456');
      expect(mockExec).toHaveBeenNthCalledWith(1, 'git', ['add', '-A'], { cwd: '/repo' });
      expect(mockExec).toHaveBeenNthCalledWith(2, 'git', ['commit', '-m', 'feat: add feature'], {
        cwd: '/repo',
      });
      expect(mockExec).toHaveBeenNthCalledWith(3, 'git', ['rev-parse', 'HEAD'], { cwd: '/repo' });
    });

    it('should throw GitPrError with GIT_ERROR on failure', async () => {
      vi.mocked(mockExec).mockRejectedValue(new Error('fatal: not a git repository'));

      await expect(service.commitAll('/repo', 'msg')).rejects.toThrow(GitPrError);
      await expect(service.commitAll('/repo', 'msg')).rejects.toMatchObject({
        code: GitPrErrorCode.GIT_ERROR,
      });
    });
  });

  describe('push', () => {
    it('should call git push origin branch', async () => {
      vi.mocked(mockExec).mockResolvedValue({ stdout: '', stderr: '' });

      await service.push('/repo', 'feat/my-branch');

      expect(mockExec).toHaveBeenCalledWith('git', ['push', 'origin', 'feat/my-branch'], {
        cwd: '/repo',
      });
    });

    it('should add --set-upstream flag when setUpstream is true', async () => {
      vi.mocked(mockExec).mockResolvedValue({ stdout: '', stderr: '' });

      await service.push('/repo', 'feat/my-branch', true);

      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['push', '--set-upstream', 'origin', 'feat/my-branch'],
        { cwd: '/repo' }
      );
    });

    it('should throw GitPrError with MERGE_CONFLICT when stderr contains rejected', async () => {
      vi.mocked(mockExec).mockRejectedValue(new Error('error: failed to push some refs rejected'));

      await expect(service.push('/repo', 'feat/x')).rejects.toMatchObject({
        code: GitPrErrorCode.MERGE_CONFLICT,
      });
    });

    it('should throw GitPrError with AUTH_FAILURE on auth errors', async () => {
      vi.mocked(mockExec).mockRejectedValue(new Error('Authentication failed for repo'));

      await expect(service.push('/repo', 'feat/x')).rejects.toMatchObject({
        code: GitPrErrorCode.AUTH_FAILURE,
      });
    });
  });

  describe('createPr', () => {
    const prYaml = [
      'title: "feat: awesome feature"',
      'body: "## Summary\\n\\nDoes awesome things"',
      'baseBranch: main',
      'headBranch: feat/awesome',
      'labels:',
      '  - feature',
      'draft: false',
    ].join('\n');

    it('should parse pr.yaml and pass title/body to gh pr create', async () => {
      vi.mocked(readFileSync).mockReturnValue(prYaml);
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'https://github.com/org/repo/pull/42\n',
        stderr: '',
      });

      const result = await service.createPr('/repo', '/repo/specs/pr.yaml');

      expect(readFileSync).toHaveBeenCalledWith('/repo/specs/pr.yaml', 'utf-8');
      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          'pr',
          'create',
          '--title',
          'feat: awesome feature',
          '--body',
          expect.any(String),
          '--base',
          'main',
          '--head',
          'feat/awesome',
          '--label',
          'feature',
        ]),
        { cwd: '/repo' }
      );
      expect(result.url).toBe('https://github.com/org/repo/pull/42');
      expect(result.number).toBe(42);
    });

    it('should apply Shep branding to the PR body', async () => {
      vi.mocked(readFileSync).mockReturnValue(prYaml);
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'https://github.com/org/repo/pull/42\n',
        stderr: '',
      });

      await service.createPr('/repo', '/repo/specs/pr.yaml');

      const callArgs = vi.mocked(mockExec).mock.calls[0];
      const ghArgs = callArgs[1] as string[];
      const bodyIndex = ghArgs.indexOf('--body');
      const body = ghArgs[bodyIndex + 1];
      expect(body).toContain(PR_BRANDING);
    });

    it('should strip Claude Code branding from PR body', async () => {
      const prYamlWithClaude = [
        'title: "feat: awesome feature"',
        'body: "## Summary\\n\\nDoes awesome things\\n\\n🤖 Generated with [Claude Code](https://claude.com/claude-code)"',
      ].join('\n');
      vi.mocked(readFileSync).mockReturnValue(prYamlWithClaude);
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'https://github.com/org/repo/pull/42\n',
        stderr: '',
      });

      await service.createPr('/repo', '/repo/specs/pr.yaml');

      const callArgs = vi.mocked(mockExec).mock.calls[0];
      const ghArgs = callArgs[1] as string[];
      const bodyIndex = ghArgs.indexOf('--body');
      const body = ghArgs[bodyIndex + 1];
      expect(body).not.toContain('Claude Code');
      expect(body).toContain(PR_BRANDING);
    });

    it('should throw GitPrError with GH_NOT_FOUND when gh is not found', async () => {
      vi.mocked(readFileSync).mockReturnValue(prYaml);
      const error = new Error('ENOENT gh not found');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      vi.mocked(mockExec).mockRejectedValue(error);

      await expect(service.createPr('/repo', '/repo/pr.yaml')).rejects.toMatchObject({
        code: GitPrErrorCode.GH_NOT_FOUND,
      });
    });
  });

  describe('mergePr', () => {
    it('should call gh pr merge without --delete-branch and attempt remote branch cleanup', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // gh pr merge
        .mockResolvedValueOnce({ stdout: 'feat/my-branch\n', stderr: '' }) // gh pr view --json headRefName
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // gh api DELETE

      await service.mergePr('/repo', 42);

      expect(mockExec).toHaveBeenCalledWith('gh', ['pr', 'merge', '42', '--squash'], {
        cwd: '/repo',
      });
    });

    it('should call gh pr merge with specified strategy', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // gh pr merge
        .mockResolvedValueOnce({ stdout: 'feat/my-branch\n', stderr: '' }) // gh pr view
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // gh api DELETE

      await service.mergePr('/repo', 42, 'rebase');

      expect(mockExec).toHaveBeenCalledWith('gh', ['pr', 'merge', '42', '--rebase'], {
        cwd: '/repo',
      });
    });

    it('should not throw when remote branch deletion fails', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // gh pr merge
        .mockRejectedValueOnce(new Error('branch delete failed')); // gh pr view fails

      await expect(service.mergePr('/repo', 42)).resolves.toBeUndefined();
    });

    it('should throw GitPrError with MERGE_FAILED on merge failure', async () => {
      vi.mocked(mockExec).mockRejectedValue(new Error('merge failed: not mergeable'));

      await expect(service.mergePr('/repo', 42)).rejects.toMatchObject({
        code: GitPrErrorCode.MERGE_FAILED,
      });
    });
  });

  describe('mergeBranch', () => {
    it('should checkout target, merge source, and push', async () => {
      vi.mocked(mockExec).mockResolvedValue({ stdout: '', stderr: '' });

      await service.mergeBranch('/repo', 'feat/my-branch', 'main');

      expect(mockExec).toHaveBeenNthCalledWith(1, 'git', ['checkout', 'main'], { cwd: '/repo' });
      expect(mockExec).toHaveBeenNthCalledWith(2, 'git', ['merge', 'feat/my-branch'], {
        cwd: '/repo',
      });
      expect(mockExec).toHaveBeenNthCalledWith(3, 'git', ['push'], { cwd: '/repo' });
    });

    it('should throw GitPrError with MERGE_CONFLICT on conflict', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // checkout
        .mockRejectedValueOnce(new Error('CONFLICT (content): Merge conflict in file.ts'));

      await expect(service.mergeBranch('/repo', 'feat/x', 'main')).rejects.toMatchObject({
        code: GitPrErrorCode.MERGE_CONFLICT,
      });
    });
  });

  describe('deleteBranch', () => {
    it('should delete local branch', async () => {
      vi.mocked(mockExec).mockResolvedValue({ stdout: '', stderr: '' });

      await service.deleteBranch('/repo', 'feat/old');

      expect(mockExec).toHaveBeenCalledWith('git', ['branch', '-d', 'feat/old'], { cwd: '/repo' });
      expect(mockExec).toHaveBeenCalledTimes(1);
    });

    it('should also delete remote when deleteRemote is true', async () => {
      vi.mocked(mockExec).mockResolvedValue({ stdout: '', stderr: '' });

      await service.deleteBranch('/repo', 'feat/old', true);

      expect(mockExec).toHaveBeenNthCalledWith(1, 'git', ['branch', '-d', 'feat/old'], {
        cwd: '/repo',
      });
      expect(mockExec).toHaveBeenNthCalledWith(
        2,
        'git',
        ['push', 'origin', '--delete', 'feat/old'],
        {
          cwd: '/repo',
        }
      );
    });
  });

  describe('getCiStatus', () => {
    it('should parse gh run list JSON output', async () => {
      const ghOutput = JSON.stringify([
        {
          conclusion: 'success',
          url: 'https://github.com/org/repo/actions/runs/123',
        },
      ]);
      vi.mocked(mockExec).mockResolvedValue({ stdout: ghOutput, stderr: '' });

      const result = await service.getCiStatus('/repo', 'feat/branch');

      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        ['run', 'list', '--branch', 'feat/branch', '--json', 'conclusion,url', '--limit', '1'],
        { cwd: '/repo' }
      );
      expect(result.status).toBe('success');
      expect(result.runUrl).toBe('https://github.com/org/repo/actions/runs/123');
    });

    it('should return pending when no runs found', async () => {
      vi.mocked(mockExec).mockResolvedValue({ stdout: '[]', stderr: '' });

      const result = await service.getCiStatus('/repo', 'feat/branch');

      expect(result.status).toBe('pending');
    });

    it('should throw GitPrError when gh command fails', async () => {
      vi.mocked(mockExec).mockRejectedValue(new Error('gh: command not found'));

      await expect(service.getCiStatus('/repo', 'feat/branch')).rejects.toThrow(GitPrError);
    });

    it('should throw GitPrError with GH_NOT_FOUND when gh is not installed', async () => {
      const error = new Error('ENOENT');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      vi.mocked(mockExec).mockRejectedValue(error);

      await expect(service.getCiStatus('/repo', 'feat/branch')).rejects.toMatchObject({
        code: GitPrErrorCode.GH_NOT_FOUND,
      });
    });

    it('should return pending when conclusion is null', async () => {
      const ghOutput = JSON.stringify([
        { conclusion: null, url: 'https://github.com/org/repo/actions/runs/456' },
      ]);
      vi.mocked(mockExec).mockResolvedValue({ stdout: ghOutput, stderr: '' });

      const result = await service.getCiStatus('/repo', 'feat/branch');

      expect(result.status).toBe('pending');
    });
  });

  describe('watchCi', () => {
    it('should resolve run ID via gh run list then watch it', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({
          // gh run list --branch ... --json databaseId,url --limit 1
          stdout: JSON.stringify([
            { databaseId: 789, url: 'https://github.com/org/repo/actions/runs/789' },
          ]),
          stderr: '',
        })
        .mockResolvedValueOnce({
          // gh run watch 789 --exit-status
          stdout: 'Run completed: success\nhttps://github.com/org/repo/actions/runs/789\n',
          stderr: '',
        });

      const result = await service.watchCi('/repo', 'feat/branch');

      expect(mockExec).toHaveBeenNthCalledWith(
        1,
        'gh',
        ['run', 'list', '--branch', 'feat/branch', '--json', 'databaseId,url', '--limit', '1'],
        { cwd: '/repo' }
      );
      expect(mockExec).toHaveBeenNthCalledWith(
        2,
        'gh',
        ['run', 'watch', '789', '--exit-status', '--compact', '--interval', '30'],
        expect.objectContaining({ cwd: '/repo' })
      );
      expect(result.status).toBe('success');
      expect(result.runUrl).toBe('https://github.com/org/repo/actions/runs/789');
    });

    it('should return pending when no runs exist for the branch', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      });

      const result = await service.watchCi('/repo', 'feat/branch');

      expect(result.status).toBe('pending');
      expect(mockExec).toHaveBeenCalledTimes(1);
    });

    it('should return failure when gh run watch exits non-zero (exit code message)', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { databaseId: 789, url: 'https://github.com/org/repo/actions/runs/789' },
          ]),
          stderr: '',
        })
        .mockRejectedValueOnce(new Error('exit code 1'));

      const result = await service.watchCi('/repo', 'feat/branch');

      expect(result.status).toBe('failure');
    });

    it('should return failure when gh run watch exits non-zero with real execFile error format', async () => {
      // This is the ACTUAL error format from Node.js execFile when gh run watch --exit-status
      // fails because CI failed. The error message is "Command failed: gh run watch <id> --exit-status\n"
      // and the error object has code (numeric exit code), stdout, and stderr.
      const execError = new Error('Command failed: gh run watch 789 --exit-status\n') as Error & {
        code: number;
        stdout: string;
        stderr: string;
      };
      execError.code = 1;
      execError.stdout = "Run CI (789) has already completed with 'failure'\n";
      execError.stderr = '';

      vi.mocked(mockExec)
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { databaseId: 789, url: 'https://github.com/org/repo/actions/runs/789' },
          ]),
          stderr: '',
        })
        .mockRejectedValueOnce(execError);

      const result = await service.watchCi('/repo', 'feat/branch');

      expect(result.status).toBe('failure');
      expect(result.logExcerpt).toBeDefined();
    });

    it('should include stdout in logExcerpt when CI fails with real execFile error', async () => {
      const execError = new Error('Command failed: gh run watch 789 --exit-status\n') as Error & {
        code: number;
        stdout: string;
        stderr: string;
      };
      execError.code = 1;
      execError.stdout = "Run CI (789) has already completed with 'failure'\n";
      execError.stderr = 'some stderr info';

      vi.mocked(mockExec)
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { databaseId: 789, url: 'https://github.com/org/repo/actions/runs/789' },
          ]),
          stderr: '',
        })
        .mockRejectedValueOnce(execError);

      const result = await service.watchCi('/repo', 'feat/branch');

      expect(result.status).toBe('failure');
      // logExcerpt should contain the actual output, not just the generic "Command failed" message
      expect(result.logExcerpt).toContain('failure');
    });

    it('should throw GIT_ERROR for genuine errors (not CI failure)', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { databaseId: 789, url: 'https://github.com/org/repo/actions/runs/789' },
          ]),
          stderr: '',
        })
        .mockRejectedValueOnce(new Error('network connection reset'));

      await expect(service.watchCi('/repo', 'feat/branch')).rejects.toMatchObject({
        code: GitPrErrorCode.GIT_ERROR,
      });
    });

    it('should throw GitPrError with CI_TIMEOUT on timeout', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { databaseId: 789, url: 'https://github.com/org/repo/actions/runs/789' },
          ]),
          stderr: '',
        })
        .mockRejectedValueOnce(new Error('timed out waiting for run'));

      await expect(service.watchCi('/repo', 'feat/branch', 5000)).rejects.toMatchObject({
        code: GitPrErrorCode.CI_TIMEOUT,
      });
    });

    it('should return success when gh run watch exits 0 even if stdout lacks "success" keyword', async () => {
      // gh run watch --exit-status exits 0 = CI passed. Period.
      // stdout may contain checkmarks like "✓ build in 1m2s" without "success" or "completed"
      vi.mocked(mockExec)
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { databaseId: 789, url: 'https://github.com/org/repo/actions/runs/789' },
          ]),
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: '✓ build (789) in 1m2s\n✓ test (790) in 2m3s\n',
          stderr: '',
        });

      const result = await service.watchCi('/repo', 'feat/branch');

      expect(result.status).toBe('success');
    });

    it('should return success when gh run watch exits 0 with empty stdout', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { databaseId: 789, url: 'https://github.com/org/repo/actions/runs/789' },
          ]),
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
        });

      const result = await service.watchCi('/repo', 'feat/branch');

      expect(result.status).toBe('success');
    });

    it('should pass timeout option to exec', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { databaseId: 789, url: 'https://github.com/org/repo/actions/runs/789' },
          ]),
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: 'completed success',
          stderr: '',
        });

      await service.watchCi('/repo', 'feat/branch', 30000);

      expect(mockExec).toHaveBeenNthCalledWith(
        2,
        'gh',
        ['run', 'watch', '789', '--exit-status', '--compact', '--interval', '30'],
        {
          cwd: '/repo',
          timeout: 30000,
        }
      );
    });
  });

  describe('getPrDiffSummary', () => {
    it('should parse git diff --stat and log correctly', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({
          // git diff --stat
          stdout:
            ' src/a.ts | 10 ++++---\n src/b.ts | 5 ++--\n 2 files changed, 8 insertions(+), 4 deletions(-)\n',
          stderr: '',
        })
        .mockResolvedValueOnce({
          // git log --oneline
          stdout: 'abc1234 feat: add A\ndef5678 feat: add B\nghi9012 fix: tweak\n',
          stderr: '',
        });

      const result = await service.getPrDiffSummary('/repo', 'main');

      expect(mockExec).toHaveBeenNthCalledWith(1, 'git', ['diff', '--stat', 'main...HEAD'], {
        cwd: '/repo',
      });
      expect(mockExec).toHaveBeenNthCalledWith(2, 'git', ['log', '--oneline', 'main...HEAD'], {
        cwd: '/repo',
      });
      expect(result.filesChanged).toBe(2);
      expect(result.additions).toBe(8);
      expect(result.deletions).toBe(4);
      expect(result.commitCount).toBe(3);
    });
  });

  describe('getFileDiffs', () => {
    it('should parse a unified diff with modified, added, and deleted files', async () => {
      const unifiedDiff = [
        'diff --git a/src/app.ts b/src/app.ts',
        'index 1234567..abcdefg 100644',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1,4 +1,5 @@',
        " import express from 'express';",
        "+import cors from 'cors';",
        ' ',
        '-const app = express();',
        '+const app = express();  // updated',
        ' app.listen(3000);',
        'diff --git a/src/new-file.ts b/src/new-file.ts',
        'new file mode 100644',
        'index 0000000..1234567',
        '--- /dev/null',
        '+++ b/src/new-file.ts',
        '@@ -0,0 +1,2 @@',
        '+export const hello = true;',
        "+export const world = 'yes';",
        'diff --git a/src/old.ts b/src/old.ts',
        'deleted file mode 100644',
        'index 1234567..0000000',
        '--- a/src/old.ts',
        '+++ /dev/null',
        '@@ -1,2 +0,0 @@',
        '-const legacy = true;',
        '-export default legacy;',
      ].join('\n');

      vi.mocked(mockExec).mockResolvedValueOnce({ stdout: unifiedDiff, stderr: '' });

      const result = await service.getFileDiffs('/repo', 'main');

      expect(mockExec).toHaveBeenCalledWith('git', ['diff', '--unified=3', 'main...HEAD'], {
        cwd: '/repo',
      });
      expect(result).toHaveLength(3);

      // Modified file
      expect(result[0].path).toBe('src/app.ts');
      expect(result[0].status).toBe('modified');
      expect(result[0].additions).toBe(2);
      expect(result[0].deletions).toBe(1);
      expect(result[0].hunks).toHaveLength(1);
      expect(result[0].hunks[0].lines).toHaveLength(6);

      // Added file
      expect(result[1].path).toBe('src/new-file.ts');
      expect(result[1].status).toBe('added');
      expect(result[1].additions).toBe(2);
      expect(result[1].deletions).toBe(0);

      // Deleted file
      expect(result[2].path).toBe('src/old.ts');
      expect(result[2].status).toBe('deleted');
      expect(result[2].additions).toBe(0);
      expect(result[2].deletions).toBe(2);
    });

    it('should return empty array for empty diff output', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getFileDiffs('/repo', 'main');

      expect(result).toEqual([]);
    });

    it('should parse renamed files', async () => {
      const renameDiff = [
        'diff --git a/src/old-name.ts b/src/new-name.ts',
        'similarity index 85%',
        'rename from src/old-name.ts',
        'rename to src/new-name.ts',
        'index 1234567..abcdefg 100644',
        '--- a/src/old-name.ts',
        '+++ b/src/new-name.ts',
        '@@ -1,3 +1,3 @@',
        " import { x } from './x';",
        "-export const name = 'old';",
        "+export const name = 'new';",
        ' ',
      ].join('\n');

      vi.mocked(mockExec).mockResolvedValueOnce({ stdout: renameDiff, stderr: '' });

      const result = await service.getFileDiffs('/repo', 'main');

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/new-name.ts');
      expect(result[0].oldPath).toBe('src/old-name.ts');
      expect(result[0].status).toBe('renamed');
    });

    it('should parse diff line numbers correctly', async () => {
      const diff = [
        'diff --git a/file.ts b/file.ts',
        'index 1234567..abcdefg 100644',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -10,4 +10,5 @@',
        ' context line',
        '-removed line',
        '+added line 1',
        '+added line 2',
        ' another context',
      ].join('\n');

      vi.mocked(mockExec).mockResolvedValueOnce({ stdout: diff, stderr: '' });

      const result = await service.getFileDiffs('/repo', 'main');
      const lines = result[0].hunks[0].lines;

      expect(lines[0]).toEqual({
        type: 'context',
        content: 'context line',
        oldNumber: 10,
        newNumber: 10,
      });
      expect(lines[1]).toEqual({ type: 'removed', content: 'removed line', oldNumber: 11 });
      expect(lines[2]).toEqual({ type: 'added', content: 'added line 1', newNumber: 11 });
      expect(lines[3]).toEqual({ type: 'added', content: 'added line 2', newNumber: 12 });
      expect(lines[4]).toEqual({
        type: 'context',
        content: 'another context',
        oldNumber: 12,
        newNumber: 13,
      });
    });

    it('should throw GitPrError when git command fails', async () => {
      vi.mocked(mockExec).mockRejectedValue(new Error('git diff failed'));

      await expect(service.getFileDiffs('/repo', 'main')).rejects.toThrow(GitPrError);
      await expect(service.getFileDiffs('/repo', 'main')).rejects.toMatchObject({
        code: GitPrErrorCode.GIT_ERROR,
      });
    });
  });

  describe('listPrStatuses', () => {
    it('should call gh pr list with correct arguments including headRefName', async () => {
      const ghOutput = JSON.stringify([
        {
          number: 42,
          state: 'OPEN',
          url: 'https://github.com/org/repo/pull/42',
          headRefName: 'feat/test',
        },
      ]);
      vi.mocked(mockExec).mockResolvedValue({ stdout: ghOutput, stderr: '' });

      await service.listPrStatuses('/repo');

      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        [
          'pr',
          'list',
          '--json',
          'number,state,url,headRefName,mergeable',
          '--state',
          'all',
          '--limit',
          '100',
        ],
        { cwd: '/repo' }
      );
    });

    it('should normalize state from UPPERCASE to PrStatus enum values', async () => {
      const ghOutput = JSON.stringify([
        {
          number: 1,
          state: 'OPEN',
          url: 'https://github.com/org/repo/pull/1',
          headRefName: 'feat/a',
        },
        {
          number: 2,
          state: 'MERGED',
          url: 'https://github.com/org/repo/pull/2',
          headRefName: 'feat/b',
        },
        {
          number: 3,
          state: 'CLOSED',
          url: 'https://github.com/org/repo/pull/3',
          headRefName: 'feat/c',
        },
      ]);
      vi.mocked(mockExec).mockResolvedValue({ stdout: ghOutput, stderr: '' });

      const result = await service.listPrStatuses('/repo');

      expect(result).toEqual([
        {
          number: 1,
          state: PrStatus.Open,
          url: 'https://github.com/org/repo/pull/1',
          headRefName: 'feat/a',
        },
        {
          number: 2,
          state: PrStatus.Merged,
          url: 'https://github.com/org/repo/pull/2',
          headRefName: 'feat/b',
        },
        {
          number: 3,
          state: PrStatus.Closed,
          url: 'https://github.com/org/repo/pull/3',
          headRefName: 'feat/c',
        },
      ]);
    });

    it('should return empty array when no PRs exist', async () => {
      vi.mocked(mockExec).mockResolvedValue({ stdout: '[]', stderr: '' });

      const result = await service.listPrStatuses('/repo');

      expect(result).toEqual([]);
    });

    it('should throw GitPrError on gh CLI failure', async () => {
      const error = new Error('gh: not found');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      vi.mocked(mockExec).mockRejectedValue(error);

      await expect(service.listPrStatuses('/repo')).rejects.toThrow(GitPrError);
      await expect(service.listPrStatuses('/repo')).rejects.toMatchObject({
        code: GitPrErrorCode.GH_NOT_FOUND,
      });
    });

    it('should throw GitPrError with AUTH_FAILURE on auth errors', async () => {
      vi.mocked(mockExec).mockRejectedValue(new Error('Authentication failed'));

      await expect(service.listPrStatuses('/repo')).rejects.toThrow(GitPrError);
      await expect(service.listPrStatuses('/repo')).rejects.toMatchObject({
        code: GitPrErrorCode.AUTH_FAILURE,
      });
    });
  });

  describe('verifyMerge', () => {
    it('should return true when feature branch is ancestor of base branch (true merge)', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // rev-parse --verify (resolveRef)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // merge-base --is-ancestor

      const result = await service.verifyMerge('/repo', 'feat/test', 'main');

      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['merge-base', '--is-ancestor', 'feat/test', 'main'],
        { cwd: '/repo' }
      );
    });

    it('should return true for squash merge (not ancestor but no diff)', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // rev-parse --verify (resolveRef)
        .mockRejectedValueOnce(new Error('exit code 1')) // merge-base --is-ancestor fails
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git diff --quiet succeeds (no diff)

      const result = await service.verifyMerge('/repo', 'feat/test', 'main');

      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('git', ['diff', '--quiet', 'feat/test', 'main'], {
        cwd: '/repo',
      });
    });

    it('should return false when neither true merge nor squash merge', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // rev-parse --verify (resolveRef)
        .mockRejectedValueOnce(new Error('exit code 1')) // merge-base --is-ancestor fails
        .mockRejectedValueOnce(new Error('exit code 1')); // git diff --quiet fails (has diff)

      const result = await service.verifyMerge('/repo', 'feat/test', 'main');

      expect(result).toBe(false);
    });

    it('should fall back to remote tracking branch when local ref is deleted', async () => {
      vi.mocked(mockExec)
        .mockRejectedValueOnce(new Error('unknown revision')) // rev-parse local fails
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // rev-parse origin/feat/test
        .mockRejectedValueOnce(new Error('exit code 1')) // merge-base --is-ancestor fails
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git diff --quiet succeeds

      const result = await service.verifyMerge('/repo', 'feat/test', 'main');

      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['diff', '--quiet', 'origin/feat/test', 'main'],
        { cwd: '/repo' }
      );
    });

    it('should return false when both local and remote refs are gone', async () => {
      vi.mocked(mockExec)
        .mockRejectedValueOnce(new Error('unknown revision')) // rev-parse local fails
        .mockRejectedValueOnce(new Error('unknown revision')); // rev-parse origin/ fails

      const result = await service.verifyMerge('/repo', 'feat/test', 'main');

      expect(result).toBe(false);
    });

    it('should return true when tree differs but base branch advanced from premergeBaseSha', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // rev-parse --verify (resolveRef)
        .mockRejectedValueOnce(new Error('exit code 1')) // merge-base --is-ancestor fails
        .mockRejectedValueOnce(new Error('exit code 1')) // git diff --quiet fails (tree differs)
        .mockResolvedValueOnce({ stdout: 'newsha456\n', stderr: '' }); // rev-parse baseBranch

      const result = await service.verifyMerge('/repo', 'feat/test', 'main', 'oldsha123');

      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('git', ['rev-parse', 'main'], { cwd: '/repo' });
    });

    it('should return false when tree differs and base branch has not advanced', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // rev-parse --verify (resolveRef)
        .mockRejectedValueOnce(new Error('exit code 1')) // merge-base --is-ancestor fails
        .mockRejectedValueOnce(new Error('exit code 1')) // git diff --quiet fails
        .mockResolvedValueOnce({ stdout: 'oldsha123\n', stderr: '' }); // rev-parse baseBranch (same)

      const result = await service.verifyMerge('/repo', 'feat/test', 'main', 'oldsha123');

      expect(result).toBe(false);
    });

    it('should not check premergeBaseSha when not provided', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // rev-parse --verify (resolveRef)
        .mockRejectedValueOnce(new Error('exit code 1')) // merge-base --is-ancestor fails
        .mockRejectedValueOnce(new Error('exit code 1')); // git diff --quiet fails

      const result = await service.verifyMerge('/repo', 'feat/test', 'main');

      expect(result).toBe(false);
      // Should NOT have called rev-parse for base branch head check
      expect(mockExec).toHaveBeenCalledTimes(3);
    });
  });

  describe('createGitHubRepo', () => {
    it('should extract the repo URL from gh repo create stdout', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout:
          '✓ Created repository octocat/my-project on GitHub\n  https://github.com/octocat/my-project\n',
        stderr: '',
      });

      const url = await service.createGitHubRepo('/repo', 'my-project', { isPrivate: true });

      expect(url).toBe('https://github.com/octocat/my-project');
    });

    it('should extract the repo URL from gh repo create stderr when stdout is empty', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: '',
        stderr: '✓ Created https://github.com/org/repo.git\n',
      });

      const url = await service.createGitHubRepo('/repo', 'repo', { isPrivate: false });

      expect(url).toBe('https://github.com/org/repo');
    });

    it('should strip trailing .git and punctuation from parsed URL', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'Remote repo created at (https://github.com/acme/widget.git),\n',
        stderr: '',
      });

      const url = await service.createGitHubRepo('/repo', 'widget', { isPrivate: true });

      expect(url).toBe('https://github.com/acme/widget');
    });

    it('should fall back to gh repo view when stdout has no URL', async () => {
      vi.mocked(mockExec)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // gh repo create — no URL
        .mockResolvedValueOnce({
          stdout: 'https://github.com/fallback/repo\n',
          stderr: '',
        }); // gh repo view

      const url = await service.createGitHubRepo('/repo', 'repo', { isPrivate: true });

      expect(url).toBe('https://github.com/fallback/repo');
      expect(mockExec).toHaveBeenNthCalledWith(
        2,
        'gh',
        ['repo', 'view', '--json', 'url', '--jq', '.url'],
        { cwd: '/repo' }
      );
    });

    it('should include org prefix when org option is provided', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'https://github.com/my-org/my-project\n',
        stderr: '',
      });

      await service.createGitHubRepo('/repo', 'my-project', {
        isPrivate: true,
        org: 'my-org',
      });

      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['repo', 'create', 'my-org/my-project', '--private']),
        { cwd: '/repo' }
      );
    });

    it('should use --public when isPrivate is false', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({
        stdout: 'https://github.com/octocat/public-repo\n',
        stderr: '',
      });

      await service.createGitHubRepo('/repo', 'public-repo', { isPrivate: false });

      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['--public']),
        expect.any(Object)
      );
    });

    it('should throw GitPrError with REPO_CREATE_FAILED when gh repo create fails', async () => {
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('repo already exists'));

      await expect(
        service.createGitHubRepo('/repo', 'my-project', { isPrivate: true })
      ).rejects.toThrow(GitPrError);

      try {
        await service.createGitHubRepo('/repo', 'my-project', { isPrivate: true });
      } catch (error) {
        expect((error as GitPrError).code).toBe(GitPrErrorCode.REPO_CREATE_FAILED);
      }
    });
  });

  describe('addRemote', () => {
    it('should run git remote add with the given name and URL', async () => {
      vi.mocked(mockExec).mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.addRemote('/repo', 'upstream', 'https://github.com/octocat/original');

      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['remote', 'add', 'upstream', 'https://github.com/octocat/original'],
        { cwd: '/repo' }
      );
    });

    it('should wrap underlying git errors in GitPrError', async () => {
      vi.mocked(mockExec).mockRejectedValueOnce(new Error('remote upstream already exists'));

      await expect(
        service.addRemote('/repo', 'upstream', 'https://github.com/x/y')
      ).rejects.toThrow(GitPrError);
    });
  });
});
