/**
 * How to launch a command on Windows without `shell: true`.
 *
 * Shared by the `ExecFunction` (git / gh / npx / model discovery) and the
 * agent-CLI `SpawnFunction`, so both route a `.cmd` shim the same way.
 *
 * Node cannot launch a `.cmd` / `.bat` file without a shell: libuv's PATH
 * search only tries `.com` and `.exe`, so `spawn('codex')` fails with ENOENT
 * when npm installed `codex.cmd`. Setting `shell: true` would fix the lookup
 * and reintroduce injection — Node concatenates the arguments into one
 * string for cmd.exe without escaping them. So the caller resolves the
 * command itself (PATH + PATHEXT, via the `which` package) and:
 *
 *   - a real executable is launched by its resolved path with its argv array
 *     and no shell — CreateProcess quoting applies, nothing to get wrong;
 *   - a `.cmd` / `.bat` shim is launched as
 *     `cmd.exe /d /e:on /v:off /s /c "<command line>"` with
 *     `windowsVerbatimArguments`, the command line built by
 *     `windows-command-line.ts`;
 *   - an unresolved command keeps its bare name, so the spawn fails with the
 *     ordinary ENOENT callers already turn into an install hint.
 */

import { buildWindowsCommandLine } from './windows-command-line.js';

/** Extensions that cmd.exe must interpret; everything else runs directly. */
const SHELL_SCRIPT_EXTENSIONS = ['.cmd', '.bat'];

/**
 * cmd.exe flags: `/d` skips AutoRun, `/e:on` keeps the `%` escape working,
 * `/v:off` disables `!VAR!` expansion even when the registry enables it,
 * `/s /c` strips the outer quote pair and runs the rest verbatim.
 */
export const CMD_FLAGS: readonly string[] = ['/d', '/e:on', '/v:off', '/s', '/c'];

/** Fallback when COMSPEC is unset. */
const DEFAULT_COMSPEC = 'cmd.exe';

/** What to hand `spawn` / `execFile` for one Windows invocation. */
export interface WindowsLaunch {
  /** Executable to launch. */
  file: string;
  /** Its arguments. */
  args: string[];
  /** True when `args` is a pre-quoted cmd.exe line (`windowsVerbatimArguments`). */
  verbatim: boolean;
}

/** Path to cmd.exe, from COMSPEC when the environment sets it. */
export function resolveComspec(env: NodeJS.ProcessEnv = process.env): string {
  return env['ComSpec'] ?? env['COMSPEC'] ?? DEFAULT_COMSPEC;
}

function isShellScript(resolvedPath: string): boolean {
  const lower = resolvedPath.toLowerCase();
  return SHELL_SCRIPT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Decide how to launch `file` on Windows.
 *
 * @param file - The command as the caller named it (`codex`).
 * @param args - Its argument vector.
 * @param resolved - Absolute path from a PATH + PATHEXT lookup, or null.
 * @param comspec - Path to cmd.exe.
 * @throws Error when a shim argument cannot be carried by cmd.exe (a newline).
 */
export function planWindowsLaunch(
  file: string,
  args: readonly string[],
  resolved: string | null,
  comspec: string
): WindowsLaunch {
  if (resolved !== null && isShellScript(resolved)) {
    const commandLine = buildWindowsCommandLine(resolved, args);
    return { file: comspec, args: [...CMD_FLAGS, `"${commandLine}"`], verbatim: true };
  }
  return { file: resolved ?? file, args: [...args], verbatim: false };
}
