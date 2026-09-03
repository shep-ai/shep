/**
 * GitCommitService Unit Tests — injected-skills staging exclusion
 *
 * Injected skills (.claude/skills/) are worktree-local tooling and must never
 * be committed. stageAndCommit must unstage newly-added files under that path
 * after `git add -A` while keeping edits to repo-tracked skills staged.
 *
 * TDD Phase: RED
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { GitCommitService } from '@/infrastructure/services/git/git-commit.service.js';
import {
  GitCommitError,
  GitPushError,
} from '@/application/ports/output/services/git-commit.service.interface.js';

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

const CWD = '/worktree/project';
const ADDED_SKILLS_QUERY = [
  'diff',
  '--cached',
  '--name-only',
  '--diff-filter=A',
  '-z',
  '--',
  '.claude/skills/',
];

interface ExecOverrides {
  add?: 'throw' | 'ok';
  addedSkillsStdout?: string | 'throw';
  hasStagedStdout?: string;
  reset?: 'throw' | 'ok';
  remote?: string | 'throw';
}

function makeExec(overrides: ExecOverrides = {}): ReturnType<typeof vi.fn<ExecFileFn>> {
  return vi.fn<ExecFileFn>(async (_cmd: string, args: string[]) => {
    const head = args[0];
    if (head === 'add') {
      if (overrides.add === 'throw') throw new Error('fatal: not a git repository');
      return { stdout: '', stderr: '' };
    }
    if (head === 'diff' && args.includes('--diff-filter=A')) {
      if (overrides.addedSkillsStdout === 'throw') throw new Error('unexpected diff failure');
      return { stdout: overrides.addedSkillsStdout ?? '', stderr: '' };
    }
    if (head === 'diff') {
      return { stdout: overrides.hasStagedStdout ?? 'src/index.ts\n', stderr: '' };
    }
    if (head === 'reset') {
      if (overrides.reset === 'throw') throw new Error('reset failed');
      return { stdout: '', stderr: '' };
    }
    if (head === 'commit') return { stdout: '', stderr: '' };
    if (head === 'remote') {
      if (overrides.remote === 'throw') throw new Error('No origin configured');
      return { stdout: overrides.remote ?? 'https://github.com/o/r.git', stderr: '' };
    }
    if (head === 'push') return { stdout: '', stderr: '' };
    throw new Error(`unexpected git args: ${args.join(' ')}`);
  });
}

describe('GitCommitService — injected skills staging exclusion', () => {
  it('unstages newly-added .claude/skills/ files between staging and commit', async () => {
    const exec = makeExec({
      addedSkillsStdout: '.claude/skills/foo/SKILL.md\0.claude/skills/foo/\0',
    });
    const service = new GitCommitService(exec);

    const result = await service.commitChanges({ cwd: CWD, message: 'feat: test' });

    expect(result.committed).toBe(true);
    expect(exec).toHaveBeenCalledWith(
      'git',
      ADDED_SKILLS_QUERY,
      expect.objectContaining({ cwd: CWD })
    );
    expect(exec).toHaveBeenCalledWith(
      'git',
      ['reset', '-q', '--', '.claude/skills/foo/SKILL.md', '.claude/skills/foo/'],
      expect.objectContaining({ cwd: CWD })
    );

    const calls = exec.mock.calls.map((c) => `${c[1][0]}:${c[1][1] ?? ''}`);
    const addIdx = calls.findIndex((c) => c.startsWith('add:'));
    const queryIdx = calls.findIndex((c) => c.startsWith('diff:'));
    const resetIdx = calls.findIndex((c) => c.startsWith('reset:'));
    const commitIdx = calls.findIndex((c) => c.startsWith('commit:'));
    expect(addIdx).toBeLessThan(queryIdx);
    expect(queryIdx).toBeLessThan(resetIdx);
    expect(resetIdx).toBeLessThan(commitIdx);
  });

  it('commits edits to repo-tracked skills without resetting (only newly-added files are excluded)', async () => {
    const exec = makeExec();
    const service = new GitCommitService(exec);

    const result = await service.commitChanges({ cwd: CWD, message: 'feat: edit tracked skill' });

    expect(result.committed).toBe(true);
    expect(exec).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['reset']),
      expect.anything()
    );
    expect(exec).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'feat: edit tracked skill'],
      expect.objectContaining({ cwd: CWD })
    );
  });

  it('skips the commit entirely when only injected skills were staged', async () => {
    const exec = makeExec({
      addedSkillsStdout: '.claude/skills/foo/SKILL.md\0',
      hasStagedStdout: '',
    });
    const service = new GitCommitService(exec);

    const result = await service.commitChanges({ cwd: CWD, message: 'feat: only skills' });

    expect(result.committed).toBe(false);
    expect(exec).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['commit']),
      expect.anything()
    );
  });

  it('falls back to unstaging the whole skills directory when enumeration fails', async () => {
    const exec = makeExec({ addedSkillsStdout: 'throw' });
    const service = new GitCommitService(exec);

    const result = await service.commitChanges({ cwd: CWD, message: 'feat: test' });

    expect(result.committed).toBe(true);
    expect(exec).toHaveBeenCalledWith(
      'git',
      ['reset', '-q', '--', '.claude/skills/'],
      expect.objectContaining({ cwd: CWD })
    );
  });

  it('still commits when the fallback reset also fails', async () => {
    const exec = makeExec({ addedSkillsStdout: 'throw', reset: 'throw' });
    const service = new GitCommitService(exec);

    const result = await service.commitChanges({ cwd: CWD, message: 'feat: test' });

    expect(result.committed).toBe(true);
    expect(exec).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'feat: test'],
      expect.objectContaining({ cwd: CWD })
    );
  });

  it('throws GitCommitError when staging fails', async () => {
    const exec = makeExec({ add: 'throw' });
    const service = new GitCommitService(exec);

    await expect(service.commitChanges({ cwd: CWD, message: 'feat: test' })).rejects.toThrow(
      GitCommitError
    );
  });

  it('commitAndPush pushes after committing', async () => {
    const exec = makeExec({
      addedSkillsStdout: '.claude/skills/foo/SKILL.md\0',
    });
    const service = new GitCommitService(exec);

    const result = await service.commitAndPush({ cwd: CWD, message: 'feat: test' });

    expect(result).toEqual({ committed: true, pushed: true });
    expect(exec).toHaveBeenCalledWith('git', ['push', 'origin', 'HEAD'], expect.anything());
  });

  it('throws GitPushError when no origin remote exists', async () => {
    const exec = makeExec({ remote: 'throw' });
    const service = new GitCommitService(exec);

    await expect(service.commitAndPush({ cwd: CWD, message: 'feat: test' })).rejects.toThrow(
      GitPushError
    );
  });
});
