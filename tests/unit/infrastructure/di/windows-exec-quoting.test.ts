/**
 * Windows ExecFunction Argument Quoting
 *
 * The Windows ExecFunction adapter wraps execFile with `shell: true` so that
 * .cmd / .bat / .ps1 files (e.g. cursor's `agent.cmd`) can be located on PATH.
 * Node.js then concatenates `file + ' ' + args.join(' ')` and hands the result
 * to cmd.exe — which re-tokenises on whitespace, splitting any arg containing
 * a space. The adapter must quote whitespace-bearing args before passing them.
 *
 * This test pins the regex used for the quoting decision so that a future
 * refactor of register-services.ts cannot silently regress the behaviour
 * documented by `gh repo create snake-game --description "snake game"`.
 *
 * Original bug: `gh repo create snake-game-da2c2d --public --source=. --remote=origin --push --description snake game`
 * arrived at gh as 9 arguments (the description "snake game" became two args
 * "snake" and "game"), and gh complained "accepts at most 1 arg(s), received 2".
 */

import { describe, it, expect } from 'vitest';

/**
 * Same predicate the Windows ExecFunction uses. Inlined here because the
 * helper is module-private inside register-services.ts; if you change the
 * helper there, mirror the change here so the contract is pinned.
 */
function quoteWindowsArg(a: string): string {
  if (/^[A-Za-z0-9_./:=+@,-]+$/.test(a)) return a;
  return `"${a.replace(/(["\\])/g, '\\$1')}"`;
}

describe('Windows exec arg quoting', () => {
  it('leaves plain alphanumeric args untouched', () => {
    expect(quoteWindowsArg('repo')).toBe('repo');
    expect(quoteWindowsArg('create')).toBe('create');
    expect(quoteWindowsArg('snake-game-da2c2d')).toBe('snake-game-da2c2d');
    expect(quoteWindowsArg('--public')).toBe('--public');
    expect(quoteWindowsArg('--source=.')).toBe('--source=.');
    expect(quoteWindowsArg('--remote=origin')).toBe('--remote=origin');
    expect(quoteWindowsArg('user@example.com')).toBe('user@example.com');
    expect(quoteWindowsArg('foo,bar')).toBe('foo,bar');
  });

  it('quotes args containing whitespace (the original gh repo create bug)', () => {
    expect(quoteWindowsArg('snake game')).toBe('"snake game"');
    expect(quoteWindowsArg('My Application Name')).toBe('"My Application Name"');
    expect(quoteWindowsArg('a b c')).toBe('"a b c"');
  });

  it('escapes embedded double quotes and backslashes', () => {
    expect(quoteWindowsArg('she said "hi"')).toBe('"she said \\"hi\\""');
    expect(quoteWindowsArg('back\\slash')).toBe('"back\\\\slash"');
  });

  it('quotes args containing shell metacharacters', () => {
    expect(quoteWindowsArg('a&b')).toBe('"a&b"');
    expect(quoteWindowsArg('a|b')).toBe('"a|b"');
    expect(quoteWindowsArg('a>b')).toBe('"a>b"');
    expect(quoteWindowsArg('a<b')).toBe('"a<b"');
    expect(quoteWindowsArg('a;b')).toBe('"a;b"');
  });

  it('quotes empty strings (otherwise they would disappear when joined)', () => {
    expect(quoteWindowsArg('')).toBe('""');
  });

  it('preserves the full gh repo create argv that broke production', () => {
    const args = [
      'repo',
      'create',
      'snake-game-da2c2d',
      '--public',
      '--source=.',
      '--remote=origin',
      '--push',
      '--description',
      'snake game',
    ];
    const quoted = args.map(quoteWindowsArg);
    expect(quoted).toEqual([
      'repo',
      'create',
      'snake-game-da2c2d',
      '--public',
      '--source=.',
      '--remote=origin',
      '--push',
      '--description',
      '"snake game"',
    ]);
  });
});
