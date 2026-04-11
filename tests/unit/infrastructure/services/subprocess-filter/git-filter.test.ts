import { describe, it, expect } from 'vitest';
import { filterGit } from '@/infrastructure/services/subprocess-filter/filters/git-filter.js';

describe('filterGit', () => {
  describe('status', () => {
    it('compacts porcelain output into [X] file format', () => {
      const porcelain = ' M src/app.ts\nA  src/new.ts\n?? untracked.txt';
      const result = filterGit('status', porcelain);
      expect(result).toContain('[M] src/app.ts');
      expect(result).toContain('[A] src/new.ts');
      expect(result).toContain('[??] untracked.txt');
    });

    it('strips boilerplate from human-readable output', () => {
      const human = [
        'On branch main',
        "Your branch is up to date with 'origin/main'.",
        '',
        'Changes not staged for commit:',
        '  (use "git add <file>..." to update what will be committed)',
        '',
        '\tmodified:   src/app.ts',
      ].join('\n');
      const result = filterGit('status', human);
      expect(result).not.toContain('On branch');
      expect(result).not.toContain('use "git');
      expect(result).toContain('modified:   src/app.ts');
    });

    it('returns "clean" for empty output', () => {
      expect(filterGit('status', '')).toBe('ok');
    });
  });

  describe('log', () => {
    it('compresses full-format log to one-line-per-commit', () => {
      const fullLog = [
        'commit a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        'Author: Alice <alice@example.com>',
        'Date:   Mon Jan 1 12:00:00 2026 +0000',
        '',
        '    Fix authentication bug',
        '',
        'commit b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
        'Author: Bob <bob@example.com>',
        'Date:   Mon Jan 1 11:00:00 2026 +0000',
        '',
        '    Add login page',
      ].join('\n');
      const result = filterGit('log', fullLog);
      expect(result).toContain('a1b2c3d Fix authentication bug');
      expect(result).toContain('b2c3d4e Add login page');
      expect(result).not.toContain('Author:');
    });

    it('passes through --oneline format with truncation', () => {
      const oneline = 'a1b2c3d Fix bug\nb2c3d4e Add feature';
      expect(filterGit('log', oneline)).toBe(oneline);
    });
  });

  describe('diff', () => {
    it('removes context lines, keeps additions and deletions', () => {
      const diff = [
        'diff --git a/src/app.ts b/src/app.ts',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1,5 +1,5 @@',
        ' import foo from "bar";',
        '-const old = 1;',
        '+const new = 2;',
        ' export default foo;',
      ].join('\n');
      const result = filterGit('diff', diff);
      expect(result).toContain('-const old = 1;');
      expect(result).toContain('+const new = 2;');
      expect(result).not.toContain(' import foo');
      expect(result).not.toContain(' export default');
    });

    it('keeps diff headers', () => {
      const diff = 'diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b';
      const result = filterGit('diff', diff);
      expect(result).toContain('diff --git');
      expect(result).toContain('---');
      expect(result).toContain('+++');
      expect(result).toContain('@@');
    });
  });

  describe('commit', () => {
    it('extracts commit hash', () => {
      const output = '[main a1b2c3d] Fix the thing\n 1 file changed, 2 insertions(+)';
      expect(filterGit('commit', output)).toBe('ok a1b2c3d');
    });

    it('returns ok when no hash found', () => {
      expect(filterGit('commit', 'something unexpected')).toBe('ok');
    });
  });

  describe('push', () => {
    it('extracts branch mapping', () => {
      const output =
        'Everything up-to-date\nTo github.com:foo/bar\n   abc1234..def5678  main -> main';
      expect(filterGit('push', output)).toContain('main → main');
    });

    it('detects up-to-date', () => {
      expect(filterGit('push', 'Everything up-to-date')).toBe('ok (up-to-date)');
    });
  });

  describe('pull', () => {
    it('extracts file change stats', () => {
      const output =
        'Updating abc..def\nFast-forward\n 3 files changed, 10 insertions(+), 2 deletions(-)';
      expect(filterGit('pull', output)).toBe('ok 3 files +10 -2');
    });

    it('detects already up to date', () => {
      expect(filterGit('pull', 'Already up to date.')).toBe('ok (up-to-date)');
    });
  });

  describe('add', () => {
    it('returns ok for clean add', () => {
      expect(filterGit('add', 'some output')).toBe('ok (added)');
    });

    it('preserves error output', () => {
      const err = 'fatal: pathspec "foo" did not match any files';
      expect(filterGit('add', err)).toBe(err);
    });
  });

  describe('branch', () => {
    it('strips leading asterisk and whitespace', () => {
      const output = '* main\n  develop\n  feature/x';
      const result = filterGit('branch', output);
      expect(result).toBe('main\ndevelop\nfeature/x');
    });
  });

  describe('unknown subcommand', () => {
    it('applies basic cleanup and truncation', () => {
      const output = 'some unknown git output\n'.repeat(10);
      const result = filterGit('unknown-cmd', output);
      expect(result).toContain('some unknown git output');
    });
  });
});
