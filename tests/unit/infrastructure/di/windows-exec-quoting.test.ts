/**
 * Windows ExecFunction command-line construction (H9)
 *
 * The Windows adapter used to resolve `.cmd` shims by setting `shell: true`
 * and pre-quoting each argument with `"${a.replace(/(["\\])/g, '\\$1')}"`.
 * cmd.exe does not recognise `\"` as an escaped quote — the backslash is an
 * ordinary character and every `"` toggles quote state — so `a"&whoami&"b`
 * became `"a\"&whoami&\"b"`, cmd closed the quote at the `"` after the
 * backslash, and `&whoami&` sat OUTSIDE quotes where `&` separates commands.
 * Live call site: `merge.node.ts` passes raw LLM output as `--title` / `--body`
 * to `gh pr create` through this wrapper, which is shared by 18 services.
 *
 * There is no Windows host in this environment, so these tests assert the
 * exact command line produced and run it through a model of cmd.exe's quote
 * state. That model is the claim being made — it is stated explicitly rather
 * than hidden inside an assertion, so a Windows reviewer can check it.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildWindowsCommandLine,
  quoteWindowsShellArgument,
} from '@/infrastructure/services/process/windows-command-line.js';
import { createExecFunction } from '@/infrastructure/services/process/exec-function.js';

/**
 * Characters cmd.exe treats as command syntax when they are not inside
 * double quotes. `^` is cmd's escape character; we never emit one.
 */
const CMD_METACHARACTERS = ['&', '|', '<', '>', '(', ')'];

/**
 * `cmd /s /c "<line>"` strips the first and last quote of the string and runs
 * the remainder verbatim — the same shape Node uses for `shell: true`. The
 * model below has to see what cmd actually runs, so strip them first.
 */
function stripOuterQuotesForCmdS(commandString: string): string {
  return commandString.startsWith('"') && commandString.endsWith('"')
    ? commandString.slice(1, -1)
    : commandString;
}

/**
 * Model of cmd.exe's scan: `"` toggles quote state, and a metacharacter seen
 * while unquoted is a command separator. Returns every such character.
 */
function metacharactersOutsideQuotes(commandLine: string): string[] {
  const found: string[] = [];
  let inQuotes = false;
  for (const ch of commandLine) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && CMD_METACHARACTERS.includes(ch)) found.push(ch);
  }
  return found;
}

/** Environment for the percent-expansion model. */
const ENV: Record<string, string> = {
  PATH: 'C:\\Windows',
  SECRET: 'hunter2',
  INJECT: '"&calc&"',
  cd: 'C:\\repo',
};

/**
 * Model of cmd.exe's command-line (not batch-file) percent expansion, which
 * runs BEFORE the quote scan and ignores quotes entirely: at each `%`, take
 * the text up to the next `%` as a variable name. A defined name — or a
 * `name:~start,length` substring of one — is replaced and scanning resumes
 * after the closing `%`. Anything else is left as a literal `%` and scanning
 * resumes AT the closing `%`, which may start the next reference.
 */
function expandCommandLinePercents(line: string, env: Record<string, string>): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    const close = ch === '%' ? line.indexOf('%', i + 1) : -1;
    if (close < 0) {
      out += ch;
      i += 1;
      continue;
    }
    const name = line.slice(i + 1, close);
    const substring = /^([^:]+):~(-?\d*),(-?\d*)$/.exec(name);
    if (substring && substring[1] in env) {
      const value = env[substring[1]];
      const start = Number(substring[2] || 0);
      const length = substring[3] === '' ? 0 : Number(substring[3]);
      out += value.slice(start, start + length);
      i = close + 1;
    } else if (name in env) {
      out += env[name];
      i = close + 1;
    } else {
      out += '%';
      i = close;
    }
  }
  return out;
}

describe('quoteWindowsShellArgument', () => {
  it('keeps the injection payload inside quotes', () => {
    const quoted = quoteWindowsShellArgument('a"&whoami&"b');

    expect(quoted).toBe('"a""&whoami&""b"');
    expect(metacharactersOutsideQuotes(quoted)).toEqual([]);
  });

  it.each([
    ['ampersand chaining', 'x" & calc & "y'],
    ['pipe', 'x" | calc | "y'],
    ['redirect', 'x" > out.txt "y'],
    ['subshell parens', 'x" (calc) "y'],
    ['the old backslash-escape shape', 'a\\"&whoami&\\"b'],
    ['a trailing backslash', 'C:\\path\\'],
    ['a lone quote', '"'],
  ])('leaves no cmd metacharacter unquoted for %s', (_label, arg) => {
    expect(metacharactersOutsideQuotes(quoteWindowsShellArgument(arg))).toEqual([]);
  });

  it('round-trips through CommandLineToArgvW rules', () => {
    // Doubling `"` inside a quoted string is a literal quote to the argv
    // parser, and backslashes are doubled only where they precede a quote.
    expect(quoteWindowsShellArgument('snake game')).toBe('"snake game"');
    expect(quoteWindowsShellArgument('C:\\Users\\My User')).toBe('"C:\\Users\\My User"');
    expect(quoteWindowsShellArgument('C:\\path\\')).toBe('"C:\\path\\\\"');
    expect(quoteWindowsShellArgument('')).toBe('""');
  });

  it('escapes % so an argument cannot name an environment variable', () => {
    // `%cd:~,%` is a zero-length substring of %cd%, so cmd expands it to
    // nothing — and the `%` before it can no longer pair with a later one.
    // This is the encoding Rust's std uses for the same reason.
    expect(quoteWindowsShellArgument('%PATH%')).toBe('"%%cd:~,%PATH%%cd:~,%"');
    expect(expandCommandLinePercents(quoteWindowsShellArgument('%SECRET%'), ENV)).toBe(
      '"%SECRET%"'
    );
    expect(expandCommandLinePercents(quoteWindowsShellArgument('%INJECT%'), ENV)).not.toContain(
      '&calc&'
    );
    expect(expandCommandLinePercents(quoteWindowsShellArgument('100% done'), ENV)).toBe(
      '"100% done"'
    );
  });

  it.each([
    ['a line feed', 'line one\nline two'],
    ['a carriage return', 'line one\rline two'],
    ['a NUL', 'a\u0000b'],
  ])('refuses %s, which cmd.exe cannot carry inside an argument', (_label, arg) => {
    expect(() => quoteWindowsShellArgument(arg)).toThrow(/cmd\.exe/);
  });

  it('quotes ordinary arguments rather than leaving them bare', () => {
    // Force-quoting removes the "is this one safe?" predicate entirely —
    // that predicate is what the old implementation got wrong.
    expect(quoteWindowsShellArgument('--public')).toBe('"--public"');
    expect(quoteWindowsShellArgument('repo')).toBe('"repo"');
  });
});

describe('buildWindowsCommandLine', () => {
  it('preserves the gh repo create argv that broke production', () => {
    const line = buildWindowsCommandLine('C:\\bin\\gh.cmd', [
      'repo',
      'create',
      'snake-game-da2c2d',
      '--public',
      '--description',
      'snake game',
    ]);

    expect(line).toBe(
      '"C:\\bin\\gh.cmd" "repo" "create" "snake-game-da2c2d" "--public" "--description" "snake game"'
    );
  });

  it('leaves no metacharacter unquoted for raw LLM title and body text', () => {
    const line = buildWindowsCommandLine('C:\\bin\\gh.cmd', [
      'pr',
      'create',
      '--title',
      'fix: handle a"&whoami&"b',
      '--body',
      'See <https://x> & also | this',
    ]);

    expect(metacharactersOutsideQuotes(line)).toEqual([]);
  });
});

describe('createExecFunction', () => {
  const result = { stdout: '', stderr: '' };

  it('runs execFile directly with no shell on posix', async () => {
    const execFileAsync = vi.fn().mockResolvedValue(result);
    const resolveExecutable = vi.fn();

    const exec = createExecFunction({ isWindows: false, execFileAsync, resolveExecutable });
    await exec('git', ['push', 'origin', '--', 'feat/x'], { cwd: '/repo' });

    expect(resolveExecutable).not.toHaveBeenCalled();
    expect(execFileAsync).toHaveBeenCalledWith('git', ['push', 'origin', '--', 'feat/x'], {
      cwd: '/repo',
    });
  });

  it('keeps the argv array for a resolved .exe on windows', async () => {
    const execFileAsync = vi.fn().mockResolvedValue(result);
    const resolveExecutable = vi.fn().mockResolvedValue('C:\\Program Files\\Git\\git.exe');

    const exec = createExecFunction({ isWindows: true, execFileAsync, resolveExecutable });
    await exec('git', ['commit', '-m', 'a"&whoami&"b'], { cwd: 'C:\\repo' });

    expect(execFileAsync).toHaveBeenCalledWith(
      'C:\\Program Files\\Git\\git.exe',
      ['commit', '-m', 'a"&whoami&"b'],
      expect.objectContaining({ cwd: 'C:\\repo', windowsHide: true })
    );
    expect(execFileAsync.mock.calls[0][2]).not.toHaveProperty('shell', true);
  });

  it('routes a .cmd shim through cmd.exe with a verbatim command line', async () => {
    const execFileAsync = vi.fn().mockResolvedValue(result);
    const resolveExecutable = vi.fn().mockResolvedValue('C:\\bin\\gh.cmd');

    const exec = createExecFunction({
      isWindows: true,
      execFileAsync,
      resolveExecutable,
      comspec: 'C:\\Windows\\System32\\cmd.exe',
    });
    await exec('gh', ['pr', 'create', '--title', 'a"&whoami&"b'], { cwd: 'C:\\repo' });

    const [file, args, options] = execFileAsync.mock.calls[0];
    expect(file).toBe('C:\\Windows\\System32\\cmd.exe');
    // /e:on keeps the `%cd:~,%` escape working; /v:off stops `!VAR!` expansion
    // even when DelayedExpansion is switched on in the registry.
    expect(args.slice(0, -1)).toEqual(['/d', '/e:on', '/v:off', '/s', '/c']);
    expect(options).toMatchObject({ windowsVerbatimArguments: true, windowsHide: true });
    expect(options).not.toHaveProperty('shell', true);
    expect(args.at(-1)).toMatch(/^".*"$/);
    expect(metacharactersOutsideQuotes(stripOuterQuotesForCmdS(args.at(-1)))).toEqual([]);
  });

  it('rejects a multi-line argument to a .cmd shim instead of letting cmd truncate it', async () => {
    const execFileAsync = vi.fn().mockResolvedValue(result);
    const resolveExecutable = vi.fn().mockResolvedValue('C:\\bin\\tool.cmd');

    const exec = createExecFunction({ isWindows: true, execFileAsync, resolveExecutable });

    await expect(exec('tool', ['--body', 'one\ntwo'])).rejects.toThrow(/newline/);
    expect(execFileAsync).not.toHaveBeenCalled();
  });

  it('falls back to the bare name when the executable is not on PATH', async () => {
    const execFileAsync = vi.fn().mockResolvedValue(result);
    const resolveExecutable = vi.fn().mockResolvedValue(null);

    const exec = createExecFunction({ isWindows: true, execFileAsync, resolveExecutable });
    await exec('nonexistent-tool', ['--version']);

    expect(execFileAsync).toHaveBeenCalledWith(
      'nonexistent-tool',
      ['--version'],
      expect.objectContaining({ windowsHide: true })
    );
  });

  it('resolves each executable only once', async () => {
    const execFileAsync = vi.fn().mockResolvedValue(result);
    const resolveExecutable = vi.fn().mockResolvedValue('C:\\bin\\git.exe');

    const exec = createExecFunction({ isWindows: true, execFileAsync, resolveExecutable });
    await exec('git', ['status']);
    await exec('git', ['log']);

    expect(resolveExecutable).toHaveBeenCalledTimes(1);
  });
});
