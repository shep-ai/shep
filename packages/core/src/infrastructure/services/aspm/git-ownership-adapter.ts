/**
 * Git ownership adapter (Phase 11, task-69).
 *
 * Uses `git log --pretty=format:%ae --follow <path>` to aggregate authors per
 * asset path. Falls back to .github/CODEOWNERS when git history is empty or
 * the repo isn't a git checkout.
 *
 * Cross-platform contract (packages/CLAUDE.md):
 *   - Never sets `shell: true`. Git is invoked directly via execFile.
 *   - Asset paths are POSIX-normalized before being passed to git so the
 *     same lookup works on Windows + Unix.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  GitOwnerCandidate,
  GitOwnerLookupInput,
  IGitOwnershipPort,
} from '../../../application/ports/output/services/git-ownership-port.interface';

const execFileAsync = promisify(execFile);

export type RunGitFn = (args: string[], cwd: string) => Promise<string>;

const defaultRunGit: RunGitFn = async (args, cwd) => {
  const { stdout } = await execFileAsync('git', args, { cwd, windowsHide: true });
  return stdout;
};

export interface GitOwnershipAdapterDeps {
  /** Override for tests — defaults to spawning `git` via execFile. */
  runGit?: RunGitFn;
  /** Override for tests — defaults to `existsSync`. */
  fileExists?: (path: string) => boolean;
  /** Override for tests — defaults to `readFileSync(..., 'utf8')`. */
  readFile?: (path: string) => string;
}

function normalizeAssetPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function parseGitLogOutput(stdout: string): GitOwnerCandidate[] {
  const counts = new Map<string, number>();
  for (const raw of stdout.split(/\r?\n/)) {
    const email = raw.trim().toLowerCase();
    if (email.length === 0) continue;
    counts.set(email, (counts.get(email) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([email, commitCount]) => ({ email, commitCount }))
    .sort((a, b) => b.commitCount - a.commitCount || a.email.localeCompare(b.email));
}

const CODEOWNERS_LINE = /^([^\s#]+)\s+(.+)$/;

function parseCodeowners(content: string, assetPath: string): GitOwnerCandidate[] {
  const matches: GitOwnerCandidate[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const m = CODEOWNERS_LINE.exec(trimmed);
    if (!m) continue;
    const pattern = m[1]!;
    const owners = m[2]!.split(/\s+/).filter((o) => o.length > 0);
    if (!matchCodeownersPattern(pattern, assetPath)) continue;
    for (const owner of owners) {
      const email = owner.startsWith('@')
        ? `${owner.slice(1).replace('/', '+')}@noreply.github`
        : owner.toLowerCase();
      matches.push({ email, commitCount: 0 });
    }
  }
  return matches;
}

function matchCodeownersPattern(pattern: string, assetPath: string): boolean {
  // CODEOWNERS supports gitignore-style globs. Simplified subset covers the
  // 90% case: `/path` (anchored), `path` (anywhere), and `**` wildcards.
  const normalized = pattern.replace(/\\/g, '/');
  const anchored = normalized.startsWith('/') ? normalized.slice(1) : normalized;
  const regex = new RegExp(
    `^${anchored
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')}(/.*)?$`
  );
  return regex.test(assetPath);
}

export class GitOwnershipAdapter implements IGitOwnershipPort {
  private readonly runGit: RunGitFn;
  private readonly fileExists: (path: string) => boolean;
  private readonly readFile: (path: string) => string;

  constructor(deps: GitOwnershipAdapterDeps = {}) {
    this.runGit = deps.runGit ?? defaultRunGit;
    this.fileExists = deps.fileExists ?? existsSync;
    this.readFile = deps.readFile ?? ((path) => readFileSync(path, 'utf8'));
  }

  async lookup(input: GitOwnerLookupInput): Promise<GitOwnerCandidate[]> {
    const normalizedPath = normalizeAssetPath(input.assetPath);

    try {
      const stdout = await this.runGit(
        ['log', '--pretty=format:%ae', '--follow', '--', normalizedPath],
        input.repoRoot
      );
      const candidates = parseGitLogOutput(stdout);
      if (candidates.length > 0) return candidates;
    } catch {
      // Fall through to CODEOWNERS.
    }

    for (const relative of [
      'CODEOWNERS',
      join('.github', 'CODEOWNERS'),
      join('docs', 'CODEOWNERS'),
    ]) {
      const absolute = join(input.repoRoot, relative);
      if (!this.fileExists(absolute)) continue;
      try {
        const content = this.readFile(absolute);
        const owners = parseCodeowners(content, normalizedPath);
        if (owners.length > 0) return owners;
      } catch {
        // continue
      }
    }

    return [];
  }
}
