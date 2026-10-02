/**
 * Git-backed repository snapshotter (spec 119).
 *
 * A snapshot fingerprints the working tree cheaply: tracked files contribute
 * their index object id, and only files `git status` reports as changed or
 * untracked are hashed from disk. `compare` re-captures and diffs per-file
 * hashes, so resume can tell exactly which paths drifted.
 *
 * Outside a git repository the snapshot is degenerate (no files, no commit)
 * rather than an error: the harness still runs, it just cannot detect drift.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  IRepoSnapshotter,
  RepoDrift,
  RepoSnapshotCapture,
} from '../../../application/ports/output/harness/index.js';

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BYTES = 256 * 1024 * 1024;
const DELETED_MARKER = 'deleted';
const GIT_OID_PREFIX = 'git:';
const FILE_HASH_PREFIX = 'sha256:';

function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    encoding: 'utf8',
    windowsHide: true,
  });
  return stdout;
}

async function isGitRepo(root: string): Promise<boolean> {
  try {
    return (await git(root, ['rev-parse', '--is-inside-work-tree'])).trim() === 'true';
  } catch {
    return false;
  }
}

/** Parse `git status --porcelain=v1 -z -uall` into changed paths. */
function parseStatus(output: string): string[] {
  const entries = output.split('\0').filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const code = entry.slice(0, 2);
    paths.push(entry.slice(3));
    // Renames and copies carry the original path as the next NUL field.
    if (code.includes('R') || code.includes('C')) i++;
  }
  return paths;
}

export class GitRepoSnapshotter implements IRepoSnapshotter {
  async capture(root: string): Promise<RepoSnapshotCapture> {
    if (!(await isGitRepo(root))) {
      return { root, workingTreeHash: sha256(''), fileHashes: {} };
    }
    const fileHashes: Record<string, string> = {};
    for (const line of (await git(root, ['ls-files', '-s', '-z'])).split('\0').filter(Boolean)) {
      // "<mode> <oid> <stage>\t<path>"
      const tab = line.indexOf('\t');
      const oid = line.slice(0, tab).split(' ')[1];
      fileHashes[line.slice(tab + 1)] = `${GIT_OID_PREFIX}${oid}`;
    }
    const changed = parseStatus(await git(root, ['status', '--porcelain=v1', '-z', '-uall']));
    for (const path of changed) {
      try {
        fileHashes[path] = `${FILE_HASH_PREFIX}${sha256(await readFile(join(root, path)))}`;
      } catch {
        fileHashes[path] = DELETED_MARKER;
      }
    }
    let gitCommit: string | undefined;
    try {
      gitCommit = (await git(root, ['rev-parse', 'HEAD'])).trim();
    } catch {
      gitCommit = undefined; // repository without commits
    }
    const sorted = Object.keys(fileHashes)
      .sort()
      .map((p) => `${p}\0${fileHashes[p]}`)
      .join('\n');
    return {
      root,
      ...(gitCommit && { gitCommit }),
      workingTreeHash: sha256(sorted),
      stagedDiffHash: sha256(await git(root, ['diff', '--cached', '--no-ext-diff'])),
      unstagedDiffHash: sha256(await git(root, ['diff', '--no-ext-diff'])),
      fileHashes,
    };
  }

  async compare(
    previous: Pick<RepoSnapshotCapture, 'fileHashes'>,
    root: string
  ): Promise<RepoDrift> {
    const current = await this.capture(root);
    const changed = new Set<string>();
    for (const [path, hash] of Object.entries(current.fileHashes)) {
      if (previous.fileHashes[path] !== hash) changed.add(path);
    }
    for (const path of Object.keys(previous.fileHashes)) {
      if (!(path in current.fileHashes)) changed.add(path);
    }
    // A tracked file that became modified changes representation (git oid →
    // content hash) without changing content only if it was reverted; both
    // count as drift here, which is the conservative answer.
    const changedPaths = [...changed].sort();
    return { drifted: changedPaths.length > 0, changedPaths };
  }
}
