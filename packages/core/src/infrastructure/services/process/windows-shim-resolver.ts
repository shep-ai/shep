/**
 * Find the `.cmd` / `.bat` shim a Windows spawn must route through cmd.exe —
 * and ONLY when shell-less `spawn` could not launch the command itself.
 *
 * Two passes, so nothing libuv already handled changes behaviour:
 *
 *   1. libuv's own search: the spawn cwd, then each PATH entry, for the name
 *      with `.com` then `.exe` (or as given, when it already ends in one).
 *      A hit means `spawn` works unaided — return null and launch as before.
 *      A native `claude.exe` therefore keeps its argv array (and multi-line
 *      `--append-system-prompt`) even when npm's `claude.cmd` is earlier on
 *      PATH.
 *   2. Only then PATH — never the cwd — for the PATHEXT shim extensions
 *      (`.cmd`, `.bat`, in PATHEXT order). The cwd is excluded because it is
 *      usually a checked-out repository, and a planted `codex.cmd` there
 *      would otherwise run with shep's privileges.
 *
 * Written over the child's own environment instead of the `which` package:
 * `which` returns the first PATH hit across ALL extensions and searches
 * `process.cwd()` first on Windows, both of which pass 1/2 must not do.
 */

import { statSync } from 'node:fs';
import { win32 } from 'node:path';

/** An environment block as `spawn` options carry it. */
export type Environment = Readonly<Record<string, string | undefined>>;

/** What libuv appends when searching PATH (win/process.c `search_path`). */
const NATIVE_EXTENSIONS = ['.com', '.exe'];

/** Extensions that need cmd.exe. */
const SHIM_EXTENSIONS = ['.cmd', '.bat'];

/** Shim extensions in Windows' default PATHEXT order, used when PATHEXT is unset. */
const DEFAULT_SHIM_PATHEXT = ['.cmd', '.bat'];

const PATH_VARIABLE = 'PATH';
const PATHEXT_VARIABLE = 'PATHEXT';
const PATH_LIST_DELIMITER = ';';

export interface ShimLookup {
  /** The child's environment (its PATH / PATHEXT are searched). */
  env: Environment;
  /** The child's working directory (libuv searches it first for `.exe`). */
  cwd: string;
  /** True when `path` is an existing regular file. */
  isFile: (path: string) => boolean;
}

/** Read an environment variable the way Windows does: name case-insensitive. */
export function readWindowsEnv(env: Environment, name: string): string | undefined {
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

function hasExtension(command: string, extensions: readonly string[]): boolean {
  const lower = command.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

function pathDirectories(env: Environment): string[] {
  return (readWindowsEnv(env, PATH_VARIABLE) ?? '')
    .split(PATH_LIST_DELIMITER)
    .map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'))
    .filter((entry) => entry.length > 0);
}

function shimExtensions(env: Environment): string[] {
  const pathExt = readWindowsEnv(env, PATHEXT_VARIABLE);
  if (pathExt === undefined) return DEFAULT_SHIM_PATHEXT;
  return pathExt
    .split(PATH_LIST_DELIMITER)
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => SHIM_EXTENSIONS.includes(extension));
}

function firstFile(
  directories: readonly string[],
  names: readonly string[],
  isFile: ShimLookup['isFile']
): string | null {
  for (const directory of directories) {
    for (const name of names) {
      const candidate = win32.join(directory, name);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/** True when `path` is an existing regular file. */
export function isRegularFile(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
  } catch {
    return false;
  }
}

/**
 * Path of the shim to run through cmd.exe, or null to spawn `command` as is.
 *
 * @param command - The command as the caller named it (`codex`).
 * @param lookup - The child's environment and cwd, and a file probe.
 */
export function findWindowsShim(command: string, lookup: ShimLookup): string | null {
  // A path is launched from where it points; PATH is not searched.
  if (/[\\/]/.test(command)) {
    const target = win32.resolve(lookup.cwd, command);
    return hasExtension(target, SHIM_EXTENSIONS) && lookup.isFile(target) ? target : null;
  }

  // A name that already ends in `.exe` / `.com` is never a shim.
  if (hasExtension(command, NATIVE_EXTENSIONS)) return null;

  const directories = pathDirectories(lookup.env);

  // Pass 1 — libuv's search. A hit means spawn works unaided.
  if (!hasExtension(command, SHIM_EXTENSIONS)) {
    const nativeNames = NATIVE_EXTENSIONS.map((extension) => `${command}${extension}`);
    if (firstFile([lookup.cwd, ...directories], nativeNames, lookup.isFile) !== null) return null;
  }

  // Pass 2 — PATH only, never the cwd, for a shim.

  const shimNames = hasExtension(command, SHIM_EXTENSIONS)
    ? [command]
    : shimExtensions(lookup.env).map((extension) => `${command}${extension}`);
  return firstFile(directories, shimNames, lookup.isFile);
}
