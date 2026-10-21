/**
 * BunShadcnScaffolder.hasExistingContent — would scaffolding here destroy anything?
 *
 * `scaffold()` empties the target directory first (`.git` included), so a
 * caller that must never lose files asks this before scaffolding. Real temp
 * directories and real git: the answer is only as good as what it inspects.
 */

import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunShadcnScaffolder } from '@/infrastructure/services/scaffolding/bun-shadcn-scaffolder.service.js';

const GIT_IDENTITY = ['-c', 'user.name=Test', '-c', 'user.email=test@local'];
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shep-scaffold-content-'));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', [...GIT_IDENTITY, ...args], { cwd, stdio: 'ignore', windowsHide: true });
}

/** What CreateProjectUseCase leaves behind: `git init` plus one empty commit. */
function freshProjectRepo(): string {
  const dir = tempDir();
  git(dir, 'init', '-b', 'main');
  git(dir, 'commit', '--allow-empty', '-m', 'Initial commit');
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('BunShadcnScaffolder.hasExistingContent', () => {
  const scaffolder = new BunShadcnScaffolder();

  it('is false for a directory that does not exist', async () => {
    await expect(scaffolder.hasExistingContent(join(tempDir(), 'missing'))).resolves.toBe(false);
  });

  it('is false for an empty directory', async () => {
    await expect(scaffolder.hasExistingContent(tempDir())).resolves.toBe(false);
  });

  it('is false for the fresh repository project creation makes', async () => {
    await expect(scaffolder.hasExistingContent(freshProjectRepo())).resolves.toBe(false);
  });

  it('is true when the directory holds any file besides .git', async () => {
    const dir = freshProjectRepo();
    writeFileSync(join(dir, 'index.ts'), 'export {};\n');

    await expect(scaffolder.hasExistingContent(dir)).resolves.toBe(true);
  });

  it('is true when .git holds history beyond the initial empty commit', async () => {
    const dir = freshProjectRepo();
    writeFileSync(join(dir, 'notes.md'), 'work\n');
    git(dir, 'add', 'notes.md');
    git(dir, 'commit', '-m', 'Work');
    git(dir, 'rm', '-q', 'notes.md');
    git(dir, 'commit', '-m', 'Remove');

    await expect(scaffolder.hasExistingContent(dir)).resolves.toBe(true);
  });

  it('is true when .git is not a readable repository (never guess it is safe)', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, '.git'), 'gitdir: /nowhere\n');

    await expect(scaffolder.hasExistingContent(dir)).resolves.toBe(true);
  });
});
