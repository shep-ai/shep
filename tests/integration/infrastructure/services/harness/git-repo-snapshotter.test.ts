import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitRepoSnapshotter } from '@/infrastructure/services/harness/git-repo-snapshotter.js';
import {
  createTempGitRepo,
  isolateGitEnv,
  type TempGitRepo,
} from '../../../../helpers/harness/temp-git-repo.js';

describe('GitRepoSnapshotter', () => {
  const snapshotter = new GitRepoSnapshotter();
  let restoreEnv: () => void;
  let repo: TempGitRepo;

  beforeAll(() => {
    restoreEnv = isolateGitEnv();
  });
  afterAll(() => restoreEnv());

  beforeEach(() => {
    repo = createTempGitRepo({ 'src/a.ts': 'export const a = 1;\n', 'README.md': '# x\n' });
  });
  afterEach(() => repo.cleanup());

  it('captures the commit, a working tree hash and per-file hashes', async () => {
    const snap = await snapshotter.capture(repo.root);
    expect(snap.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(snap.workingTreeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(snap.fileHashes).sort()).toEqual(['README.md', 'src/a.ts']);
  });

  it('gives the same hash for an unchanged tree', async () => {
    const a = await snapshotter.capture(repo.root);
    const b = await snapshotter.capture(repo.root);
    expect(a.workingTreeHash).toBe(b.workingTreeHash);
    expect((await snapshotter.compare(a, repo.root)).drifted).toBe(false);
  });

  it('reports an edited file as drift', async () => {
    const before = await snapshotter.capture(repo.root);
    repo.write('src/a.ts', 'export const a = 2;\n');
    const drift = await snapshotter.compare(before, repo.root);
    expect(drift).toEqual({ drifted: true, changedPaths: ['src/a.ts'] });
  });

  it('reports added (untracked) and deleted files', async () => {
    const before = await snapshotter.capture(repo.root);
    repo.write('src/new.ts', 'x');
    rmSync(join(repo.root, 'README.md'));
    const drift = await snapshotter.compare(before, repo.root);
    expect(drift.changedPaths).toEqual(['README.md', 'src/new.ts']);
  });

  it('reports a staged change and changes the staged diff hash', async () => {
    const before = await snapshotter.capture(repo.root);
    repo.write('src/a.ts', 'export const a = 3;\n');
    repo.git('add', 'src/a.ts');
    const after = await snapshotter.capture(repo.root);
    expect(after.stagedDiffHash).not.toBe(before.stagedDiffHash);
    expect((await snapshotter.compare(before, repo.root)).changedPaths).toEqual(['src/a.ts']);
  });

  it('does not throw outside a git repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shep-harness-nogit-'));
    writeFileSync(join(dir, 'f.txt'), 'x');
    try {
      const snap = await snapshotter.capture(dir);
      expect(snap.gitCommit).toBeUndefined();
      expect(snap.fileHashes).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
