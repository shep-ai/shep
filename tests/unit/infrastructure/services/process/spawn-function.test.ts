/**
 * Windows-aware SpawnFunction for agent CLIs
 *
 * npm installs agent CLIs on Windows as `.cmd` shims (`codex.cmd`,
 * `gemini.cmd`, `copilot.cmd`, `kimi.cmd`, `cline.cmd`, `claude.cmd`).
 * `child_process.spawn('codex', args)` without a shell only finds `.exe` /
 * `.com`, so every one of those agents failed with ENOENT on Windows. The
 * shared spawner resolves the command with PATHEXT and routes a shim through
 * cmd.exe with a command line built by `windows-command-line.ts`.
 *
 * Nothing here spawns a real process or depends on the host OS: platform,
 * PATH lookup and the underlying spawn are all injected.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { createSpawnFunction } from '@/infrastructure/services/process/spawn-function.js';

const COMSPEC = 'C:\\Windows\\System32\\cmd.exe';
const FAKE_CHILD = { pid: 4242 } as unknown as ChildProcess;

/** cmd.exe flags the shim route must use (see windows-launch.ts). */
const EXPECTED_CMD_FLAGS = ['/d', '/e:on', '/v:off', '/s', '/c'];

/**
 * Model of cmd.exe's quote scan: `"` toggles quote state, and a
 * metacharacter seen while unquoted is a command separator.
 */
function metacharactersOutsideQuotes(commandLine: string): string[] {
  const found: string[] = [];
  let inQuotes = false;
  for (const ch of commandLine) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ['&', '|', '<', '>', '(', ')', '^'].includes(ch)) found.push(ch);
  }
  return found;
}

function stubs(resolved: string | null) {
  const spawn = vi.fn().mockReturnValue(FAKE_CHILD);
  const findShim = vi.fn().mockReturnValue(resolved);
  return { spawn, findShim };
}

describe('createSpawnFunction', () => {
  describe.each(['linux', 'darwin'])('on %s', () => {
    it('passes command, args and options through untouched', () => {
      const { spawn, findShim } = stubs(null);
      const spawnFn = createSpawnFunction({ isWindows: false, spawn, findShim });
      const options = { cwd: '/repo', stdio: 'pipe' };

      const child = spawnFn('codex', ['exec', '--json', '-'], options);

      expect(child).toBe(FAKE_CHILD);
      expect(findShim).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith('codex', ['exec', '--json', '-'], options);
    });

    it('does not reinterpret shell metacharacters in arguments', () => {
      const { spawn, findShim } = stubs(null);
      const spawnFn = createSpawnFunction({ isWindows: false, spawn, findShim });

      spawnFn('cline', ['-y', 'a"&whoami&"b %PATH% !x!']);

      expect(spawn).toHaveBeenCalledWith('cline', ['-y', 'a"&whoami&"b %PATH% !x!'], undefined);
    });
  });

  describe('on win32', () => {
    it('launches an npm .cmd shim through cmd.exe with a verbatim command line', () => {
      const { spawn, findShim } = stubs('C:\\Users\\dev\\AppData\\Roaming\\npm\\codex.CMD');
      const spawnFn = createSpawnFunction({
        isWindows: true,
        spawn,
        findShim,
        comspec: COMSPEC,
      });

      spawnFn('codex', ['exec', 'resume', 'sess-1', '-'], { cwd: 'C:\\repo', stdio: 'pipe' });

      const [file, args, options] = spawn.mock.calls[0];
      expect(file).toBe(COMSPEC);
      expect(args).toEqual([
        ...EXPECTED_CMD_FLAGS,
        '""C:\\Users\\dev\\AppData\\Roaming\\npm\\codex.CMD" "exec" "resume" "sess-1" "-""',
      ]);
      expect(options).toMatchObject({
        cwd: 'C:\\repo',
        stdio: 'pipe',
        windowsVerbatimArguments: true,
      });
      expect(options).not.toHaveProperty('shell');
    });

    it('treats a .bat shim the same as a .cmd shim', () => {
      const { spawn, findShim } = stubs('C:\\tools\\kimi.bat');
      const spawnFn = createSpawnFunction({
        isWindows: true,
        spawn,
        findShim,
        comspec: COMSPEC,
      });

      spawnFn('kimi', ['--print']);

      expect(spawn.mock.calls[0][0]).toBe(COMSPEC);
      expect(spawn.mock.calls[0][1].at(-1)).toBe('""C:\\tools\\kimi.bat" "--print""');
    });

    it('keeps a cmd metacharacter payload inside quotes', () => {
      const { spawn, findShim } = stubs('C:\\npm\\cline.cmd');
      const spawnFn = createSpawnFunction({
        isWindows: true,
        spawn,
        findShim,
        comspec: COMSPEC,
      });

      spawnFn('cline', ['--model', 'gpt"&calc&"x', 'x" | calc > out ^ (y) "z']);

      const commandString: string = spawn.mock.calls[0][1].at(-1);
      // `/s /c` strips the outermost quote pair before cmd scans the rest.
      const scanned = commandString.slice(1, -1);
      expect(metacharactersOutsideQuotes(scanned)).toEqual([]);
      expect(scanned).toContain('"gpt""&calc&""x"');
    });

    it('escapes % so an argument cannot expand an environment variable', () => {
      const { spawn, findShim } = stubs('C:\\npm\\codex.cmd');
      const spawnFn = createSpawnFunction({
        isWindows: true,
        spawn,
        findShim,
        comspec: COMSPEC,
      });

      spawnFn('codex', ['--model', '%OPENAI_API_KEY%']);

      const commandString: string = spawn.mock.calls[0][1].at(-1);
      expect(commandString).not.toContain('"%OPENAI_API_KEY%"');
      expect(commandString).toContain('"%%cd:~,%OPENAI_API_KEY%%cd:~,%"');
    });

    it('refuses an argument cmd.exe cannot carry instead of truncating it', () => {
      const { spawn, findShim } = stubs('C:\\npm\\copilot.cmd');
      const spawnFn = createSpawnFunction({
        isWindows: true,
        spawn,
        findShim,
        comspec: COMSPEC,
      });

      expect(() => spawnFn('copilot', ['-p', 'line one\nline two'])).toThrow(/newline/i);
      expect(spawn).not.toHaveBeenCalled();
    });

    it('spawns the bare command unchanged when libuv can launch it without a shim', () => {
      // findShim returns null for a native claude.exe (see windows-shim-resolver).
      const { spawn, findShim } = stubs(null);
      const spawnFn = createSpawnFunction({
        isWindows: true,
        spawn,
        findShim,
        comspec: COMSPEC,
      });
      const options = { cwd: 'C:\\repo' };

      spawnFn('claude', ['-p', '--append-system-prompt', 'line one\nline two'], options);

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        ['-p', '--append-system-prompt', 'line one\nline two'],
        options
      );
    });

    it('passes the bare name through when the command is not on PATH', () => {
      // spawn then emits its usual ENOENT, which executors map to an install hint.
      const { spawn, findShim } = stubs(null);
      const spawnFn = createSpawnFunction({
        isWindows: true,
        spawn,
        findShim,
        comspec: COMSPEC,
      });

      spawnFn('gemini', ['-p', '']);

      expect(spawn).toHaveBeenCalledWith('gemini', ['-p', ''], undefined);
    });

    it('searches the PATH and cwd the child will receive', () => {
      const { spawn, findShim } = stubs(null);
      const spawnFn = createSpawnFunction({
        isWindows: true,
        spawn,
        findShim,
        comspec: COMSPEC,
      });
      const env = { Path: 'C:\\space\\bin', PATHEXT: '.EXE;.CMD' };

      spawnFn('codex', ['exec'], { env, cwd: 'C:\\work\\repo' });

      expect(findShim).toHaveBeenCalledWith('codex', env, 'C:\\work\\repo');
    });

    it('leaves a caller that asked for a shell alone', () => {
      const { spawn, findShim } = stubs('C:\\npm\\codex.cmd');
      const spawnFn = createSpawnFunction({
        isWindows: true,
        spawn,
        findShim,
        comspec: COMSPEC,
      });
      const options = { shell: true };

      spawnFn('codex', ['--version'], options);

      expect(findShim).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith('codex', ['--version'], options);
    });
  });
});
