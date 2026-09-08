/**
 * Integration: GitCommitService must never commit injected skills
 *
 * Uses a real git repository to prove that `stageAndCommit` unstages
 * newly-added files under `.claude/skills/` (injected, worktree-local skills)
 * while still committing ordinary files and edits to repo-tracked skills.
 *
 * Regression test for the injected-skill leak into Merge Review commits.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

import { GitCommitService } from '../../../../../packages/core/src/infrastructure/services/git/git-commit.service.js';
import type { ExecFunction } from '../../../../../packages/core/src/infrastructure/services/git/worktree.service.js';

const execFileRaw = promisify(execFileCb);

function makeRealExec(): ExecFunction {
  return (file, args, options) =>
    execFileRaw(file, args, { encoding: 'utf-8', ...(options ?? {}) });
}

function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return makeRealExec()('git', args, { cwd });
}

function destroyDirs(dirs: string[]): void {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

/** Repo state: main with README.md + a repo-tracked skill committed. */
async function createRepo(): Promise<string> {
  const repoDir = mkdtempSync(join(tmpdir(), 'shep-commit-skills-'));
  await git(repoDir, ['init', '-b', 'main']);
  await git(repoDir, ['config', 'user.email', 'test@shep.test']);
  await git(repoDir, ['config', 'user.name', 'Shep Test']);
  await git(repoDir, ['config', 'core.autocrlf', 'false']);

  writeFileSync(join(repoDir, 'README.md'), '# Test Repo\n');
  const trackedSkill = join(repoDir, '.claude', 'skills', 'repo-skill');
  mkdirSync(trackedSkill, { recursive: true });
  writeFileSync(join(trackedSkill, 'SKILL.md'), '# Repo tracked skill\n');

  await git(repoDir, ['add', '-A']);
  await git(repoDir, ['commit', '-m', 'Initial commit']);
  return repoDir;
}

async function committedFiles(repoDir: string): Promise<string[]> {
  const { stdout } = await git(repoDir, ['show', '--name-only', '--format=', 'HEAD']);
  return stdout.split('\n').filter((line) => line.trim().length > 0);
}

async function statusEntries(repoDir: string): Promise<string[]> {
  const { stdout } = await git(repoDir, ['status', '--porcelain']);
  return stdout.split('\n').filter((line) => line.trim().length > 0);
}

describe('GitCommitService — injected skills exclusion (real git)', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await createRepo();
  });

  afterEach(() => {
    destroyDirs([repoDir]);
  });

  it('commits ordinary files and tracked-skill edits, but not injected skills', async () => {
    writeFileSync(join(repoDir, 'src-feature.ts'), '// Feature implementation\n');
    const trackedSkillFile = join(repoDir, '.claude', 'skills', 'repo-skill', 'SKILL.md');
    writeFileSync(trackedSkillFile, '# Repo tracked skill — edited by feature\n');
    const injectedSkill = join(repoDir, '.claude', 'skills', 'injected-skill');
    mkdirSync(injectedSkill, { recursive: true });
    writeFileSync(join(injectedSkill, 'SKILL.md'), '# Injected worktree-local skill\n');

    const service = new GitCommitService(makeRealExec());
    const result = await service.commitChanges({
      cwd: repoDir,
      message: 'feat: add feature',
    });

    expect(result.committed).toBe(true);
    const files = await committedFiles(repoDir);
    expect(files).toContain('src-feature.ts');
    expect(files).toContain('.claude/skills/repo-skill/SKILL.md');
    expect(files).not.toContain('.claude/skills/injected-skill/SKILL.md');

    // The injected skill must remain worktree-local: present on disk, still untracked.
    const status = await statusEntries(repoDir);
    expect(status.some((line) => line.includes('.claude/skills/injected-skill/'))).toBe(true);
  });

  it('skips the commit when the only staged content is injected skills', async () => {
    const injectedSkill = join(repoDir, '.claude', 'skills', 'injected-skill');
    mkdirSync(injectedSkill, { recursive: true });
    writeFileSync(join(injectedSkill, 'SKILL.md'), '# Injected worktree-local skill\n');

    const service = new GitCommitService(makeRealExec());
    const result = await service.commitChanges({
      cwd: repoDir,
      message: 'feat: should not commit',
    });

    expect(result.committed).toBe(false);

    // Nothing new was committed and the skill is still untracked in the worktree.
    const files = await committedFiles(repoDir);
    expect(files).not.toContain('.claude/skills/injected-skill/SKILL.md');
    const status = await statusEntries(repoDir);
    expect(status.some((line) => line.includes('.claude/skills/injected-skill/'))).toBe(true);
  });
});
