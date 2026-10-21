/**
 * Which `.cmd` / `.bat` shim (if any) a Windows spawn must route via cmd.exe
 *
 * The rule is "change nothing libuv could already launch": libuv's own search
 * (the spawn cwd, then PATH, for `.com` / `.exe`) wins whenever it finds
 * something, so a native `claude.exe` keeps running with its argv array even
 * when npm's `claude.cmd` sits earlier on PATH. Only when that search finds
 * nothing is PATH searched again for a shim — and never the cwd, so a
 * checked-out repository cannot plant a `codex.cmd` that shep would run.
 *
 * Paths use `path.win32` and a fake file system, so this runs on any host.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect } from 'vitest';
import {
  findWindowsShim,
  readWindowsEnv,
} from '@/infrastructure/services/process/windows-shim-resolver.js';

const NPM = 'C:\\Users\\dev\\AppData\\Roaming\\npm';
const NATIVE = 'C:\\Users\\dev\\.local\\bin';
const REPO = 'C:\\work\\repo';

/** A fake file system holding exactly `files` (compared case-insensitively, like NTFS). */
function fileSystem(...files: string[]): (path: string) => boolean {
  const present = new Set(files.map((file) => file.toLowerCase()));
  return (path) => present.has(path.toLowerCase());
}

function find(command: string, files: string[], env: Record<string, string> = {}) {
  return findWindowsShim(command, {
    env: { Path: `${NPM};${NATIVE}`, ...env },
    cwd: REPO,
    isFile: fileSystem(...files),
  });
}

describe('findWindowsShim', () => {
  it('returns the npm shim when it is the only install', () => {
    expect(find('codex', [`${NPM}\\codex.cmd`])).toBe(`${NPM}\\codex.cmd`);
  });

  it('lets a native .exe later on PATH beat a .cmd shim earlier on PATH', () => {
    // libuv would have launched claude.exe; routing claude.cmd through cmd.exe
    // instead would break every multi-line argument (--append-system-prompt).
    expect(find('claude', [`${NPM}\\claude.cmd`, `${NATIVE}\\claude.exe`])).toBeNull();
  });

  it('lets a .com beat a shim, as libuv does', () => {
    expect(find('tool', [`${NPM}\\tool.cmd`, `${NATIVE}\\tool.com`])).toBeNull();
  });

  it('never runs a shim from the working directory', () => {
    expect(find('codex', [`${REPO}\\codex.cmd`, `${REPO}\\codex.bat`])).toBeNull();
  });

  it('treats an .exe in the working directory as libuv does: no shim needed', () => {
    expect(find('codex', [`${REPO}\\codex.exe`, `${NPM}\\codex.cmd`])).toBeNull();
  });

  it('finds a .bat shim and follows PATHEXT order between .cmd and .bat', () => {
    expect(find('kimi', [`${NPM}\\kimi.bat`])).toBe(`${NPM}\\kimi.bat`);
    expect(
      find('kimi', [`${NPM}\\kimi.bat`, `${NPM}\\kimi.cmd`], { PATHEXT: '.EXE;.BAT;.CMD' })
    ).toBe(`${NPM}\\kimi.bat`);
  });

  it('ignores a shim extension PATHEXT does not list', () => {
    expect(find('kimi', [`${NPM}\\kimi.bat`], { PATHEXT: '.EXE;.CMD' })).toBeNull();
  });

  it('accepts a command that already names its shim extension', () => {
    expect(find('codex.cmd', [`${NPM}\\codex.cmd`])).toBe(`${NPM}\\codex.cmd`);
  });

  it('leaves a command that already names an .exe to libuv', () => {
    expect(find('powershell.exe', [`${NPM}\\powershell.exe.cmd`])).toBeNull();
  });

  it('handles quoted and empty PATH entries', () => {
    expect(
      find('gemini', ['C:\\Program Files\\nodejs\\gemini.cmd'], {
        Path: ';"C:\\Program Files\\nodejs";',
      })
    ).toBe('C:\\Program Files\\nodejs\\gemini.cmd');
  });

  it('resolves a command given as a path without searching PATH', () => {
    expect(find('C:\\tools\\agent.cmd', ['C:\\tools\\agent.cmd'])).toBe('C:\\tools\\agent.cmd');
    expect(find('C:\\tools\\agent.exe', ['C:\\tools\\agent.exe'])).toBeNull();
  });

  it('returns null when nothing is installed, so spawn reports ENOENT as before', () => {
    expect(find('copilot', [])).toBeNull();
  });
});

describe('readWindowsEnv', () => {
  it('reads variables case-insensitively, as Windows does', () => {
    expect(readWindowsEnv({ Path: 'C:\\a', PathExt: '.EXE' }, 'PATH')).toBe('C:\\a');
    expect(readWindowsEnv({ Path: 'C:\\a', PathExt: '.EXE' }, 'PATHEXT')).toBe('.EXE');
    expect(readWindowsEnv({}, 'PATH')).toBeUndefined();
  });
});
