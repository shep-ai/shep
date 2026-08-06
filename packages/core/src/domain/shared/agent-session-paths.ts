/**
 * Agent provider session path conventions.
 *
 * Each agent CLI stores its conversations under a directory whose name is a
 * mangled form of the project path, and each provider mangles differently.
 * These encodings were previously implemented twice — once in the core session
 * repositories and once in `src/presentation/web/lib/session-scanner.ts` — with
 * the two copies drifting apart. Per the LESSONS.md rule that shared semantics
 * belong in `domain/` before the second consumer exists, they live here and
 * nowhere else.
 *
 * NOTE: relative imports inside `domain/` carry no file extension, because the
 * web package consumes `domain/` as raw TypeScript.
 */

import { createHash } from 'node:crypto';

/** Length of the repo-hash prefix shep uses for worktree directory names. */
const WORKTREE_HASH_LENGTH = 16;

/**
 * Encode a project path the way Claude Code names its project directories:
 * every `/`, `\`, `.`, and `:` becomes `-`.
 *
 * The `:` case matters on Windows — a Windows drive letter (`C:\...`) would
 * otherwise land in the encoded name, and `:` is not a legal character in an
 * NTFS path component.
 *
 * @example "/home/user/.shep/repos/abc" -> "-home-user--shep-repos-abc"
 * @example "C:\\Users\\dev\\project" -> "C--Users-dev-project"
 */
export function encodeClaudeProjectDir(projectPath: string): string {
  return projectPath.replace(/[/\\.:]/g, '-');
}

/**
 * Encode a project path the way Cursor names its project directories: strip a
 * leading `/`, drop dots entirely, then turn separators into `-`.
 *
 * Note this differs from the Claude encoding in two ways — dots are removed
 * rather than replaced, and the leading separator is dropped rather than
 * becoming a leading hyphen.
 *
 * @example "/home/user/.shep/repos/abc" -> "home-user-shep-repos-abc"
 */
export function encodeCursorProjectDir(projectPath: string): string {
  return projectPath.replace(/^\//, '').replace(/\./g, '').replace(/[/\\]/g, '-');
}

/**
 * The short hash shep uses to name a repository's worktree directory under
 * `~/.shep/repos/<hash>`.
 *
 * Backslashes are normalized first so a Windows path and its POSIX-form
 * sibling hash identically — otherwise worktree sessions would be invisible on
 * one platform.
 */
export function shepWorktreeRepoHash(repositoryPath: string): string {
  const normalized = repositoryPath.replace(/\\/g, '/');
  return createHash('sha256').update(normalized).digest('hex').slice(0, WORKTREE_HASH_LENGTH);
}
