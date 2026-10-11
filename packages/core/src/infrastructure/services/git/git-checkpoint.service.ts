/**
 * GitCheckpointService (spec 138)
 *
 * Snapshots a worktree into a hidden ref without touching the branch, HEAD,
 * the real index or any file — the approach T3 Code uses for its per-turn
 * checkpoints:
 *
 *   1. a temporary GIT_INDEX_FILE, seeded from the real index (so git can reuse
 *      its stat cache instead of re-hashing every file) or from HEAD;
 *   2. `add -A` into it, `write-tree`;
 *   3. `commit-tree` with a fixed identity and no signing, `update-ref`.
 *
 * Writes run with `core.fsync=objects,reference` so a crash right after a step
 * cannot leave a ref pointing at an object that never reached the disk.
 *
 * Every call goes through the injected ExecFunction (argv, no shell). Object
 * ids and refs are validated before they reach git's argv.
 */

import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { inject, injectable } from 'tsyringe';
import type {
  CheckpointDiffStat,
  CommitCheckpointInput,
  IGitCheckpointService,
  WorktreeSnapshot,
} from '../../../application/ports/output/services/git-checkpoint-service.interface.js';
import type { FileDiff } from '../../../application/ports/output/services/git-pr-service.interface.js';
import { assertSafeGitRef } from '../../../domain/shared/git-ref-argument.js';
import type { ExecFunction } from './worktree.service.js';
import { parseUnifiedDiff } from './unified-diff.parser.js';

/** Durability for the objects and the ref a checkpoint writes. */
const FSYNC_CONFIG = ['-c', 'core.fsync=objects,reference'];

/** Checkpoints are Shep's, never the user's: fixed identity, never signed. */
const CHECKPOINT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Shep',
  GIT_AUTHOR_EMAIL: 'checkpoints@shep.local',
  GIT_COMMITTER_NAME: 'Shep',
  GIT_COMMITTER_EMAIL: 'checkpoints@shep.local',
};

/** Same ceiling GitPrService uses for diffs. */
const DIFF_MAX_BUFFER_BYTES = 50 * 1024 * 1024;

/** Checkpoint diffs are immutable; keep the most recent few in memory. */
const DIFF_CACHE_SIZE = 32;

/** Full or abbreviated object ids only — never an option or a revision expression. */
const OBJECT_ID_PATTERN = /^[0-9a-f]{4,64}$/;

/** Where git keeps the private git-dir of each linked worktree. */
const LINKED_WORKTREES_DIR = 'worktrees';

/** `--numstat` marks a binary file with `-` instead of a line count. */
const BINARY_NUMSTAT = '-';

/** Windows paths are case-insensitive and may come back with either separator. */
function comparablePath(path: string): string {
  const normalized = resolve(path).replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function assertObjectId(value: string, name: string): string {
  if (!OBJECT_ID_PATTERN.test(value)) throw new Error(`${name} is not an object id: ${value}`);
  return value;
}

@injectable()
export class GitCheckpointService implements IGitCheckpointService {
  private readonly diffCache = new Map<string, FileDiff[]>();

  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async snapshotWorktree(cwd: string): Promise<WorktreeSnapshot> {
    await this.assertWorkTreeRoot(cwd);
    const headSha = await this.resolveHead(cwd);
    const indexDir = await mkdtemp(join(tmpdir(), 'shep-checkpoint-'));
    const indexFile = join(indexDir, 'index');
    const env = { ...process.env, GIT_INDEX_FILE: indexFile };
    try {
      const realIndex = await this.gitPath(cwd, 'index');
      if (existsSync(realIndex)) {
        await copyFile(realIndex, indexFile);
      } else {
        await this.git(cwd, ['read-tree', ...(headSha ? [headSha] : ['--empty'])], { env });
      }
      await this.git(cwd, ['add', '-A', '--', '.'], { env });
      const treeSha = (await this.git(cwd, ['write-tree'], { env })).trim();
      return { treeSha: assertObjectId(treeSha, 'tree'), ...(headSha ? { headSha } : {}) };
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  }

  async commitCheckpoint(input: CommitCheckpointInput): Promise<string> {
    const { cwd, treeSha, headSha, ref, message } = input;
    assertSafeGitRef(ref, 'ref');
    const parent = headSha ? ['-p', assertObjectId(headSha, 'headSha')] : [];
    const commit = (
      await this.git(
        cwd,
        [
          ...FSYNC_CONFIG,
          'commit-tree',
          '--no-gpg-sign',
          ...parent,
          '-m',
          message,
          assertObjectId(treeSha, 'treeSha'),
        ],
        { env: { ...process.env, ...CHECKPOINT_IDENTITY } }
      )
    ).trim();
    await this.git(cwd, [...FSYNC_CONFIG, 'update-ref', ref, assertObjectId(commit, 'commit')]);
    return commit;
  }

  async diffStat(
    cwd: string,
    fromTree: string | undefined,
    toTree: string
  ): Promise<CheckpointDiffStat> {
    const to = assertObjectId(toTree, 'toTree');
    const args = fromTree
      ? ['diff', '--numstat', '--find-renames', assertObjectId(fromTree, 'fromTree'), to]
      : ['ls-tree', '-r', '--name-only', to];
    const lines = (await this.git(cwd, args, { maxBuffer: DIFF_MAX_BUFFER_BYTES }))
      .split('\n')
      .filter((line) => line.trim());
    if (!fromTree) return { filesChanged: lines.length, additions: 0, deletions: 0 };

    let additions = 0;
    let deletions = 0;
    for (const line of lines) {
      const [added, deleted] = line.split('\t');
      if (added !== BINARY_NUMSTAT) additions += Number(added);
      if (deleted !== BINARY_NUMSTAT) deletions += Number(deleted);
    }
    return { filesChanged: lines.length, additions, deletions };
  }

  async diff(cwd: string, from: string, to: string): Promise<FileDiff[]> {
    const key = `${assertObjectId(from, 'from')}..${assertObjectId(to, 'to')}`;
    const cached = this.diffCache.get(key);
    if (cached) {
      // Refresh recency: Map iteration order is insertion order.
      this.diffCache.delete(key);
      this.diffCache.set(key, cached);
      return cached;
    }
    const raw = await this.git(cwd, ['diff', '--find-renames', '--unified=3', from, to], {
      maxBuffer: DIFF_MAX_BUFFER_BYTES,
    });
    const files = parseUnifiedDiff(raw);
    this.diffCache.set(key, files);
    if (this.diffCache.size > DIFF_CACHE_SIZE) {
      const oldest = this.diffCache.keys().next().value;
      if (oldest !== undefined) this.diffCache.delete(oldest);
    }
    return files;
  }

  async restoreWorktree(cwd: string, treeSha: string): Promise<void> {
    const tree = assertObjectId(treeSha, 'treeSha');
    // Remove untracked, non-ignored files the checkpoint may not have had…
    await this.git(cwd, ['clean', '-fdq']);
    // …write the checkpoint into the index and the working tree, deleting
    // tracked files it does not contain…
    await this.git(cwd, [...FSYNC_CONFIG, 'read-tree', '--reset', '-u', tree]);
    // …and put the index back on HEAD, so the rollback is an ordinary unstaged
    // change on top of an unmoved branch.
    await this.git(cwd, ['reset', '-q']);
  }

  /**
   * Fails closed: only positive evidence makes a directory a linked worktree.
   * git keeps a linked worktree's git-dir at `<common-dir>/worktrees/<name>`.
   * Both sides are resolved through `realpathSync.native`, because git prints
   * long paths while a cwd can be an 8.3 short path on Windows (`RUNNER~1`).
   * A comparison that cannot be resolved therefore answers "not linked".
   */
  async isLinkedWorktree(cwd: string): Promise<boolean> {
    const [gitDir, commonDir] = (
      await this.git(cwd, ['rev-parse', '--absolute-git-dir', '--git-common-dir'])
    )
      .split('\n')
      .map((line) => line.trim());
    if (!gitDir || !commonDir) return false;
    const common = comparablePath(
      realpathSync.native(isAbsolute(commonDir) ? commonDir : resolve(cwd, commonDir))
    );
    const own = comparablePath(realpathSync.native(gitDir));
    return own !== common && own.startsWith(`${common}/${LINKED_WORKTREES_DIR}/`);
  }

  async deleteRefs(cwd: string, refPrefix: string): Promise<number> {
    assertSafeGitRef(refPrefix, 'refPrefix');
    const refs = (await this.git(cwd, ['for-each-ref', '--format=%(refname)', refPrefix]))
      .split('\n')
      .map((line) => line.trim())
      .filter((ref) => ref.startsWith(refPrefix));
    for (const ref of refs) {
      await this.git(cwd, ['update-ref', '-d', ref]);
    }
    return refs.length;
  }

  /**
   * A worktree removed by post-merge cleanup can leave its directory behind.
   * If that directory sits inside another repository, git walks up and would
   * snapshot the parent checkout under this feature's name — so only the top
   * of a work tree is ever snapshotted.
   */
  private async assertWorkTreeRoot(cwd: string): Promise<void> {
    const toplevel = (await this.git(cwd, ['rev-parse', '--show-toplevel'])).trim();
    if (
      comparablePath(realpathSync.native(toplevel)) !== comparablePath(realpathSync.native(cwd))
    ) {
      throw new Error(`${cwd} is not the top of a git work tree (git resolved ${toplevel})`);
    }
  }

  private async resolveHead(cwd: string): Promise<string | undefined> {
    try {
      const head = (await this.git(cwd, ['rev-parse', '--verify', '-q', 'HEAD^{commit}'])).trim();
      return head ? assertObjectId(head, 'HEAD') : undefined;
    } catch {
      // Unborn branch: rev-parse --verify -q exits 1 with no output.
      return undefined;
    }
  }

  private async gitPath(cwd: string, name: string): Promise<string> {
    const path = (await this.git(cwd, ['rev-parse', '--git-path', name])).trim();
    return isAbsolute(path) ? path : resolve(cwd, path);
  }

  private async git(cwd: string, args: string[], options: object = {}): Promise<string> {
    const { stdout } = await this.execFile('git', args, { cwd, ...options });
    return stdout;
  }
}
