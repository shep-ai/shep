/**
 * GitProbeWorktreeService on a real repository (spec 150): probes fork from
 * exactly the base commit, inspection commits leftovers and runs the
 * configured test command, the chosen probe fast-forwards into the feature
 * worktree, and disposal leaves nothing behind.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  createTempGitRepo,
  isolateGitEnv,
  type TempGitRepo,
} from '../../../helpers/harness/temp-git-repo.js';
import { GitProbeWorktreeService } from '@/infrastructure/services/harness-learning/git-probe-worktree.service.js';

const run = promisify(execFile);
const exec = (file: string, args: string[], options?: object) =>
  run(file, args, options as object).then((r) => ({
    stdout: String(r.stdout),
    stderr: String(r.stderr),
  }));

describe('GitProbeWorktreeService', () => {
  let repo: TempGitRepo;
  let restoreEnv: () => void;
  const service = new GitProbeWorktreeService(exec);

  beforeEach(() => {
    restoreEnv = isolateGitEnv();
    repo = createTempGitRepo({
      'README.md': '# app\n',
      '.shep/harness/config.yaml': 'test_command: node check.mjs\n',
      'check.mjs':
        "import { existsSync } from 'node:fs';\nprocess.exit(existsSync('feature.txt') ? 0 : 1);\n",
    });
  });

  afterEach(() => {
    repo.cleanup();
    restoreEnv();
  });

  it('forks from the base commit, inspects, adopts and disposes', async () => {
    const base = await service.headCommit(repo.root);
    const a = await service.fork(repo.root, base, 'agg1');
    const b = await service.fork(repo.root, base, 'agg2');
    try {
      expect(readFileSync(join(a.path, 'README.md'), 'utf8')).toBe('# app\n');
      writeFileSync(join(a.path, 'feature.txt'), 'done\n');

      const good = await service.inspect(a);
      const empty = await service.inspect(b);
      expect(good.delivered).toBe(true);
      expect(good.diff).toContain('+done');
      expect(good.diffStat).toContain('feature.txt');
      expect(good.checks).toEqual([
        expect.objectContaining({ command: 'node check.mjs', passed: true, exitCode: 0 }),
      ]);
      expect(empty.delivered).toBe(false);
      expect(empty.checks[0].passed).toBe(false);

      await service.adopt(a, repo.root);
      expect(readFileSync(join(repo.root, 'feature.txt'), 'utf8')).toBe('done\n');
      expect(repo.git('status', '--porcelain')).toBe('');
    } finally {
      await service.dispose(a);
      await service.dispose(b);
    }
    expect(existsSync(a.path)).toBe(false);
    expect(repo.git('worktree', 'list')).not.toContain('shep-probe-');
  });

  it('adopting an unchanged probe leaves the feature worktree as it was', async () => {
    const base = await service.headCommit(repo.root);
    const probe = await service.fork(repo.root, base, 'base1');
    try {
      await service.inspect(probe);
      await service.adopt(probe, repo.root);
      expect(await service.headCommit(repo.root)).toBe(base);
    } finally {
      await service.dispose(probe);
    }
  });
});
