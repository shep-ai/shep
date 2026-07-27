/**
 * Worktree Git Output Parsing
 *
 * Pure helpers for turning `git worktree` output and failures into domain
 * types. Extracted from WorktreeService so the service itself stays focused
 * on orchestrating git and the user-configured provisioning hooks.
 */

import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { WorktreeInfo } from '../../../application/ports/output/services/worktree-service.interface.js';
import {
  WorktreeError,
  WorktreeErrorCode,
} from '../../../application/ports/output/services/worktree-service.interface.js';
import { IS_WINDOWS } from '../../platform.js';

const WORKTREE_PREFIX = 'worktree ';
const HEAD_PREFIX = 'HEAD ';
const BRANCH_PREFIX = 'branch ';
const REFS_HEADS_PREFIX = 'refs/heads/';
const MACOS_PRIVATE_PREFIX = '/private/var/';
const DARWIN = 'darwin';

/**
 * Parse the output of `git worktree list --porcelain` into WorktreeInfo records.
 * The first block is always the main worktree.
 */
export function parseWorktreeOutput(output: string): WorktreeInfo[] {
  if (!output.trim()) return [];

  const worktrees: WorktreeInfo[] = [];
  const blocks = output.split('\n\n').filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.split('\n');
    const wtPath = lines.find((l) => l.startsWith(WORKTREE_PREFIX))?.slice(WORKTREE_PREFIX.length);
    const head = lines.find((l) => l.startsWith(HEAD_PREFIX))?.slice(HEAD_PREFIX.length) ?? '';
    const branchLine = lines.find((l) => l.startsWith(BRANCH_PREFIX));
    const fullBranch = branchLine?.slice(BRANCH_PREFIX.length) ?? '';
    const branch = fullBranch.replace(REFS_HEADS_PREFIX, '');

    if (wtPath) {
      worktrees.push({
        path: wtPath,
        head,
        branch,
        isMain: worktrees.length === 0, // First entry is always main
      });
    }
  }

  return worktrees;
}

/**
 * Classify a raw git failure into a typed WorktreeError.
 */
export function parseGitError(error: unknown): WorktreeError {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  if (message.includes('already exists')) {
    return new WorktreeError(message, WorktreeErrorCode.ALREADY_EXISTS, cause);
  }
  if (message.includes('already checked out') || message.includes('is already checked out')) {
    return new WorktreeError(message, WorktreeErrorCode.BRANCH_IN_USE, cause);
  }
  if (message.includes('not a valid directory') || message.includes('is not a working tree')) {
    return new WorktreeError(message, WorktreeErrorCode.NOT_FOUND, cause);
  }

  return new WorktreeError(message, WorktreeErrorCode.GIT_ERROR, cause);
}

/**
 * Compare two worktree paths, tolerating separator, trailing-slash, case
 * (Windows) and /private/var (macOS) differences.
 */
export function arePathsEquivalent(a: string, b: string): boolean {
  return normalizeWorktreePath(a) === normalizeWorktreePath(b);
}

function normalizeWorktreePath(input: string): string {
  // On Windows, git outputs forward slashes but path.normalize uses backslashes.
  // Normalize to forward slashes before comparing, case-insensitive.
  if (IS_WINDOWS) {
    let normalized = path.normalize(input).replace(/\\/g, '/').replace(/\/+$/, '');
    try {
      normalized = realpathSync(normalized).replace(/\\/g, '/');
    } catch {
      // Path may not exist yet — use as-is
    }
    return normalized.toLowerCase();
  }

  const normalized = path.normalize(input).replace(/\/+$/, '');

  // On macOS, git can report /private/var/... while callers use /var/...
  if (process.platform === DARWIN && normalized.startsWith(MACOS_PRIVATE_PREFIX)) {
    return normalized.slice('/private'.length);
  }

  return normalized;
}
