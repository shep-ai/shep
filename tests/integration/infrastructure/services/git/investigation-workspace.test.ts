/**
 * Integration: an investigation reads a detached worktree of the repository's
 * HEAD, and the user's checkout (branch, status, files) is the same however
 * the investigation ends. Real git, real repository.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';
import type { ExecFunction } from '@/infrastructure/services/git/worktree.service.js';
import { GitInvestigationWorkspace } from '@/infrastructure/services/git/investigation-workspace.service.js';
import { INVESTIGATION_STALE_AFTER_MS } from '@/domain/shared/investigation.js';

const execFileRaw = promisify(execFileCb);
const realExec: ExecFunction = (file, args, options) =>
  execFileRaw(file, args, { encoding: 'utf-8', ...(options ?? {}) });

async function git(cwd: string, args: string[]): Promise<string> {
  return (await realExec('git', args, { cwd })).stdout.trim();
}

let workDir: string;
let repoDir: string;
let root: string;
let workspace: GitInvestigationWorkspace;

beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'shep-inv-'));
  repoDir = join(workDir, 'repo');
  root = join(workDir, 'inv');
  mkdirSync(repoDir);
  await git(repoDir, ['init', '-q', '-b', 'main']);
  await git(repoDir, ['config', 'user.email', 't@example.com']);
  await git(repoDir, ['config', 'user.name', 'T']);
  await git(repoDir, ['config', 'core.autocrlf', 'false']);
  writeFileSync(join(repoDir, 'app.ts'), 'export const a = 1;\n');
  await git(repoDir, ['add', '.']);
  await git(repoDir, ['commit', '-q', '-m', 'init']);
  await git(repoDir, ['checkout', '-q', '-b', 'feature/mine']);
  // Uncommitted work the investigation must never touch.
  writeFileSync(join(repoDir, 'app.ts'), 'export const a = 2;\n');
  workspace = new GitInvestigationWorkspace(realExec, root);
});

afterEach(async () => {
  await removeDirWithRetry(workDir);
});

describe('GitInvestigationWorkspace', () => {
  it('checks out HEAD detached, then removes it, leaving the checkout as it was', async () => {
    const statusBefore = await git(repoDir, ['status', '--porcelain']);
    const head = await git(repoDir, ['rev-parse', 'HEAD']);

    const checkout = await workspace.prepare(repoDir, 'abcdef12-3456');
    expect(checkout.commitSha).toBe(head);
    expect(readFileSync(join(checkout.path, 'app.ts'), 'utf-8')).toBe('export const a = 1;\n');
    expect(await git(checkout.path, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('HEAD');

    // Whatever the agent does in the copy stays there.
    writeFileSync(join(checkout.path, 'app.ts'), 'broken');
    writeFileSync(join(checkout.path, 'new.ts'), 'new');

    await workspace.dispose(repoDir, checkout);
    expect(existsSync(checkout.path)).toBe(false);
    expect(await git(repoDir, ['worktree', 'list', '--porcelain'])).not.toContain(checkout.path);
    expect(await git(repoDir, ['status', '--porcelain'])).toBe(statusBefore);
    expect(await git(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('feature/mine');
    expect(readFileSync(join(repoDir, 'app.ts'), 'utf-8')).toBe('export const a = 2;\n');
    expect(await git(repoDir, ['branch', '--list'])).not.toMatch(/inv/);
  });

  it('dispose does not throw when the copy is already gone', async () => {
    const checkout = await workspace.prepare(repoDir, 'gone0000');
    await removeDirWithRetry(checkout.path);
    await expect(workspace.dispose(repoDir, checkout)).resolves.toBeUndefined();
    expect(await git(repoDir, ['worktree', 'list', '--porcelain'])).not.toContain('gone0000');
  });

  it('sweeps copies left behind by a process that died', async () => {
    const orphan = await workspace.prepare(repoDir, 'orphan00');
    const old = new Date(Date.now() - INVESTIGATION_STALE_AFTER_MS - 60_000);
    utimesSync(orphan.path, old, old);

    const fresh = await workspace.prepare(repoDir, 'fresh000');
    expect(existsSync(orphan.path)).toBe(false);
    expect(existsSync(fresh.path)).toBe(true);
    expect(await git(repoDir, ['worktree', 'list', '--porcelain'])).not.toContain('orphan00');
    await workspace.dispose(repoDir, fresh);
  });

  it('refuses a directory that is not a git repository', async () => {
    const plain = join(workDir, 'plain');
    mkdirSync(plain);
    await expect(workspace.prepare(plain, 'plain000')).rejects.toThrow(/git repository/);
  });

  it('refuses a repository with no commits', async () => {
    const empty = join(workDir, 'empty');
    mkdirSync(empty);
    await git(empty, ['init', '-q']);
    await expect(workspace.prepare(empty, 'empty000')).rejects.toThrow(/no commits/);
  });
});
