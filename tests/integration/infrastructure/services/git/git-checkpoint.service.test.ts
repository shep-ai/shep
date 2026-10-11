/**
 * GitCheckpointService against real git (spec 138).
 *
 * The contract that matters most — "capture never touches the user's branch,
 * HEAD, index or files" — can only be proven by real git. The global/system
 * config is isolated and signing disabled (LESSONS.md), and the feature
 * worktree lives in a directory whose name contains a space.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createTempGitRepo,
  isolateGitEnv,
  type TempGitRepo,
} from '../../../../helpers/harness/temp-git-repo.js';
import { removeDirWithRetry } from '../../../../helpers/remove-dir.helper.js';
import { GitCheckpointService } from '@/infrastructure/services/git/git-checkpoint.service.js';
import { createExecFunction } from '@/infrastructure/services/process/exec-function.js';

const PREFIX = 'refs/shep/checkpoints/feat-1/';

describe('GitCheckpointService (real git)', () => {
  let restoreEnv: () => void;
  let repo: TempGitRepo;
  let worktree: string;
  let service: GitCheckpointService;

  const wtGit = (...args: string[]) => repo.git('-C', worktree, ...args).trim();
  const write = (path: string, content: string) => {
    mkdirSync(join(worktree, path, '..'), { recursive: true });
    writeFileSync(join(worktree, path), content);
  };

  /** Everything a capture must leave untouched. */
  const observable = () => ({
    status: wtGit('status', '--porcelain=v1', '-uall'),
    head: wtGit('rev-parse', 'HEAD'),
    branch: wtGit('rev-parse', '--abbrev-ref', 'HEAD'),
    staged: wtGit('diff', '--cached', '--name-only'),
  });

  async function capture(seq: number, node: string) {
    const snap = await service.snapshotWorktree(worktree);
    const commit = await service.commitCheckpoint({
      cwd: worktree,
      treeSha: snap.treeSha,
      headSha: snap.headSha,
      ref: `${PREFIX}${String(seq).padStart(4, '0')}-${node}`,
      message: `checkpoint ${node}`,
    });
    return { ...snap, commit };
  }

  beforeAll(() => {
    restoreEnv = isolateGitEnv();
  });
  afterAll(() => restoreEnv());

  beforeEach(() => {
    repo = createTempGitRepo({ 'a.txt': 'one\n', '.gitignore': 'ignored/\n' });
    worktree = join(repo.root, '..', `${repo.root.split(/[\\/]/).pop()} wt dir`);
    repo.git('worktree', 'add', '-q', '-b', 'feat/x', worktree);
    service = new GitCheckpointService(createExecFunction());
  }, 60_000);

  afterEach(() => {
    removeDirWithRetry(worktree);
    removeDirWithRetry(repo.root);
  });

  it('captures tracked, staged and untracked files without touching branch, HEAD, index or files', async () => {
    write('a.txt', 'one\ntwo\n');
    write('staged.txt', 'staged\n');
    wtGit('add', 'staged.txt');
    write('dir/new.txt', 'new\n');
    write('ignored/secret.txt', 'secret\n');
    const before = observable();

    const { treeSha, headSha, commit } = await capture(1, 'implement');

    expect(observable()).toEqual(before);
    expect(headSha).toBe(before.head);
    const files = wtGit('ls-tree', '-r', '--name-only', treeSha).split('\n');
    expect(files.sort()).toEqual(['.gitignore', 'a.txt', 'dir/new.txt', 'staged.txt']);
    expect(wtGit('show', `${treeSha}:a.txt`)).toBe('one\ntwo');
    // The checkpoint commit's parent is the branch HEAD, and its tree is the snapshot.
    expect(wtGit('rev-parse', `${commit}^`)).toBe(before.head);
    expect(wtGit('rev-parse', `${commit}^{tree}`)).toBe(treeSha);
  });

  it('writes the ref to the shared ref store, visible from the main checkout', async () => {
    const { commit } = await capture(0, 'baseline');
    expect(repo.git('rev-parse', `${PREFIX}0000-baseline`).trim()).toBe(commit);
    // and not as a branch or tag
    expect(repo.git('branch', '--list').trim()).not.toContain('checkpoint');
  });

  it('produces the same tree twice when nothing changed', async () => {
    const first = await service.snapshotWorktree(worktree);
    const second = await service.snapshotWorktree(worktree);
    expect(second.treeSha).toBe(first.treeSha);
  });

  it('computes stat and diff between two checkpoints', async () => {
    const before = await capture(0, 'baseline');
    write('a.txt', 'one\nTWO\nthree\n');
    write('b.txt', 'b\n');
    const after = await capture(1, 'implement');

    expect(await service.diffStat(worktree, before.treeSha, after.treeSha)).toEqual({
      filesChanged: 2,
      additions: 3,
      deletions: 0,
    });
    const diff = await service.diff(repo.root, before.commit, after.commit);
    expect(diff.map((f) => [f.path, f.status])).toEqual([
      ['a.txt', 'modified'],
      ['b.txt', 'added'],
    ]);
    // cached: the same answer, and the same object
    expect(await service.diff(repo.root, before.commit, after.commit)).toBe(diff);
  });

  it('diffStat from nothing counts every file', async () => {
    const snap = await service.snapshotWorktree(worktree);
    const stat = await service.diffStat(worktree, undefined, snap.treeSha);
    expect(stat.filesChanged).toBe(2);
  });

  it('restores the worktree to a checkpoint without moving the branch, keeping ignored files', async () => {
    write('b.txt', 'b at checkpoint\n');
    const checkpoint = await capture(1, 'implement');
    // later work: committed and uncommitted changes, new and deleted files
    write('a.txt', 'rewritten\n');
    write('extra.txt', 'extra\n');
    wtGit('add', '-A');
    wtGit('commit', '-q', '-m', 'agent work');
    write('late.txt', 'late\n');
    write('ignored/cache.bin', 'cache\n');
    const headBefore = wtGit('rev-parse', 'HEAD');

    await service.restoreWorktree(worktree, checkpoint.treeSha);

    expect(wtGit('rev-parse', 'HEAD')).toBe(headBefore);
    expect(wtGit('rev-parse', '--abbrev-ref', 'HEAD')).toBe('feat/x');
    expect(readFileSync(join(worktree, 'a.txt'), 'utf8')).toBe('one\n');
    expect(readFileSync(join(worktree, 'b.txt'), 'utf8')).toBe('b at checkpoint\n');
    expect(existsSync(join(worktree, 'extra.txt'))).toBe(false);
    expect(existsSync(join(worktree, 'late.txt'))).toBe(false);
    expect(existsSync(join(worktree, 'ignored', 'cache.bin'))).toBe(true);
    // index is back at HEAD: nothing staged
    expect(wtGit('diff', '--cached', '--name-only')).toBe('');
    // and the working tree is exactly the checkpoint
    expect((await service.snapshotWorktree(worktree)).treeSha).toBe(checkpoint.treeSha);
  });

  it('tells a linked worktree from the main checkout', async () => {
    expect(await service.isLinkedWorktree(worktree)).toBe(true);
    expect(await service.isLinkedWorktree(repo.root)).toBe(false);
  });

  it("deletes only the feature's refs", async () => {
    await capture(0, 'baseline');
    await capture(1, 'implement');
    const other = await service.snapshotWorktree(worktree);
    await service.commitCheckpoint({
      cwd: worktree,
      treeSha: other.treeSha,
      headSha: other.headSha,
      ref: 'refs/shep/checkpoints/feat-10/0000-baseline',
      message: 'other feature',
    });

    expect(await service.deleteRefs(repo.root, PREFIX)).toBe(2);
    expect(repo.git('for-each-ref', '--format=%(refname)', 'refs/shep/').trim()).toBe(
      'refs/shep/checkpoints/feat-10/0000-baseline'
    );
    expect(await service.deleteRefs(repo.root, PREFIX)).toBe(0);
  });

  it('refuses to snapshot a directory that is not the top of its own work tree', async () => {
    // A worktree removed by post-merge cleanup can leave its directory behind;
    // when that directory sits inside another repository, git would otherwise
    // walk up and snapshot the parent checkout.
    const nested = join(repo.root, 'leftover-worktree');
    mkdirSync(nested);
    writeFileSync(join(nested, 'stray.txt'), 'stray\n');
    await expect(service.snapshotWorktree(nested)).rejects.toThrow(
      /not the top of a git work tree/
    );
  });

  it('captures on an unborn branch', async () => {
    const fresh = createTempGitRepo();
    try {
      writeFileSync(join(fresh.root, 'first.txt'), 'first\n');
      const snap = await service.snapshotWorktree(fresh.root);
      expect(snap.headSha).toBeUndefined();
      const commit = await service.commitCheckpoint({
        cwd: fresh.root,
        treeSha: snap.treeSha,
        ref: `${PREFIX}0000-baseline`,
        message: 'baseline',
      });
      expect(fresh.git('rev-list', '--count', commit).trim()).toBe('1');
      expect(fresh.git('status', '--porcelain').trim()).toBe('?? first.txt');
    } finally {
      removeDirWithRetry(fresh.root);
    }
  });
});
