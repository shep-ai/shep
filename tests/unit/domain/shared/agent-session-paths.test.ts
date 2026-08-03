/**
 * agent-session-paths Unit Tests
 *
 * TDD Phase: RED — written before the helper exists.
 *
 * These encodings were previously duplicated between the core session
 * repositories and src/presentation/web/lib/session-scanner.ts, with the two
 * copies drifting. Centralising them in domain/shared is what makes deleting
 * the web scanner safe (spec 105).
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  encodeClaudeProjectDir,
  encodeCursorProjectDir,
  shepWorktreeRepoHash,
} from '@/domain/shared/agent-session-paths.js';

describe('encodeClaudeProjectDir', () => {
  it('replaces slashes with hyphens', () => {
    expect(encodeClaudeProjectDir('/Users/dev/project')).toBe('-Users-dev-project');
  });

  it('replaces dots with hyphens', () => {
    expect(encodeClaudeProjectDir('/home/user/.shep/repos/abc')).toBe('-home-user--shep-repos-abc');
  });

  it('replaces backslashes with hyphens so Windows paths encode identically', () => {
    expect(encodeClaudeProjectDir('C:\\Users\\dev\\project')).toBe('C:-Users-dev-project');
  });

  it('handles a worktree path with all three replaced characters', () => {
    expect(encodeClaudeProjectDir('/home/user/.shep/repos/abc/wt/feat-x')).toBe(
      '-home-user--shep-repos-abc-wt-feat-x'
    );
  });
});

describe('encodeCursorProjectDir', () => {
  it('strips the leading slash, removes dots, and hyphenates separators', () => {
    expect(encodeCursorProjectDir('/home/user/.shep/repos/abc')).toBe('home-user-shep-repos-abc');
  });

  it('encodes a plain project path', () => {
    expect(encodeCursorProjectDir('/Users/dev/project')).toBe('Users-dev-project');
  });

  it('removes dots without leaving a separator behind', () => {
    expect(encodeCursorProjectDir('/Users/dev/my.app')).toBe('Users-dev-myapp');
  });

  it('differs from the Claude encoding for the same input', () => {
    const path = '/Users/dev/project';
    expect(encodeCursorProjectDir(path)).not.toBe(encodeClaudeProjectDir(path));
  });
});

describe('shepWorktreeRepoHash', () => {
  it('is the first 16 hex characters of the sha256 of the normalized path', () => {
    const path = '/Users/dev/project';
    const expected = createHash('sha256').update(path).digest('hex').slice(0, 16);

    expect(shepWorktreeRepoHash(path)).toBe(expected);
    expect(shepWorktreeRepoHash(path)).toHaveLength(16);
  });

  it('normalizes backslashes before hashing so Windows and POSIX forms agree', () => {
    expect(shepWorktreeRepoHash('C:\\Users\\dev\\project')).toBe(
      shepWorktreeRepoHash('C:/Users/dev/project')
    );
  });

  it('produces different hashes for different paths', () => {
    expect(shepWorktreeRepoHash('/a')).not.toBe(shepWorktreeRepoHash('/b'));
  });
});
