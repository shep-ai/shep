/**
 * Would scaffolding into this directory destroy anything?
 *
 * The scaffold empties its target first, `.git` included, so any caller that
 * must never lose files (a setup retry) asks this before scaffolding. Only
 * three shapes are safe to wipe: no directory, an empty one, or one holding
 * nothing but the fresh repository project creation makes (`git init` plus a
 * single empty commit — see `FsProjectScaffoldService`). Anything else, or a
 * `.git` that cannot be read, counts as content to keep.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const GIT_DIR = '.git';
/** `git init` + the empty "Initial commit" project creation makes. */
const FRESH_REPO_MAX_COMMITS = 1;

export function hasExistingContent(repositoryPath: string): boolean {
  if (!existsSync(repositoryPath)) return false;
  const entries = readdirSync(repositoryPath);
  if (entries.some((entry) => entry !== GIT_DIR)) return true;
  if (entries.length === 0) return false;
  return !isFreshProjectRepository(repositoryPath);
}

function git(cwd: string, args: string[]): string | null {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout : null;
}

function isFreshProjectRepository(repositoryPath: string): boolean {
  // `--all` counts every ref, the stash included.
  const commits = git(repositoryPath, ['rev-list', '--count', '--all']);
  if (commits === null || Number(commits.trim()) > FRESH_REPO_MAX_COMMITS) return false;
  // With no files in the working tree, any status line is staged or deleted work.
  const status = git(repositoryPath, ['status', '--porcelain']);
  return status !== null && status.trim() === '';
}
