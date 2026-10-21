/**
 * The shared `ExecFunction` every git / gh / npx / kubectl / docker call goes
 * through (18 services resolve it from the container).
 *
 * POSIX is unchanged and stays that way: `execFile` with an argv array and no
 * shell is already safe, because the arguments never become one string.
 *
 * Windows needs a resolution step. Agent CLIs ship as `.cmd` shims (cursor's
 * `agent.cmd`, `npx.cmd`), and `execFile` without a shell cannot resolve a
 * PATHEXT extension, which is why the old adapter reached for `shell: true`.
 * That is exactly what made the injection possible: with `shell: true`, Node
 * concatenates `file + ' ' + args.join(' ')` and hands the result to cmd.exe
 * with no escaping of its own, so the adapter's hand-rolled quoting was the
 * only thing standing between raw LLM output and a command separator.
 *
 * So shims are found explicitly instead, by `windows-shim-resolver.ts`,
 * which only reports one when libuv could not have launched the command
 * itself, and never from the working directory:
 *
 *   - a real executable (`git.exe`) is spawned by name with its argv array
 *     and NO shell — Node's own CreateProcess quoting applies and there is
 *     nothing left to get wrong;
 *   - a `.cmd` / `.bat` shim must go through cmd.exe, so it is spawned as
 *     `cmd.exe /d /e:on /v:off /s /c "<command line>"` with
 *     `windowsVerbatimArguments`, where the command line is built by
 *     `windows-command-line.ts` rather than by string concatenation.
 *
 * That decision lives in `windows-launch.ts`, shared with the agent-CLI
 * `SpawnFunction` (`spawn-function.ts`).
 *
 * Resolution is cached per executable name: this function is called for every
 * git invocation and a PATH walk per call would be a real cost.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { IS_WINDOWS } from '../../platform.js';
import { planWindowsLaunch, resolveComspec } from './windows-launch.js';
import { findWindowsShim, isRegularFile } from './windows-shim-resolver.js';
import type { ExecFunction } from '../git/worktree.service.js';

type ExecFileAsync = (
  file: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

export interface ExecFunctionDeps {
  /** True when the command line will be interpreted by cmd.exe. */
  isWindows: boolean;
  /** Promisified `child_process.execFile`. */
  execFileAsync: ExecFileAsync;
  /** The `.cmd` / `.bat` to run through cmd.exe, or null to run the name as is. */
  resolveExecutable: (file: string) => Promise<string | null>;
  /** Path to cmd.exe. */
  comspec: string;
}

const defaultExecFileAsync = promisify(execFile) as unknown as ExecFileAsync;

const defaultResolveExecutable = (file: string): Promise<string | null> =>
  Promise.resolve(
    findWindowsShim(file, { env: process.env, cwd: process.cwd(), isFile: isRegularFile })
  );

/**
 * Build the `ExecFunction` registered under the `ExecFunction` token.
 *
 * @param overrides - Injection seams for tests; production passes none.
 */
export function createExecFunction(overrides: Partial<ExecFunctionDeps> = {}): ExecFunction {
  const deps: ExecFunctionDeps = {
    isWindows: IS_WINDOWS,
    execFileAsync: defaultExecFileAsync,
    resolveExecutable: defaultResolveExecutable,
    comspec: resolveComspec(),
    ...overrides,
  };

  if (!deps.isWindows) {
    return (file, args, options) => deps.execFileAsync(file, args, options);
  }

  const resolutions = new Map<string, Promise<string | null>>();
  const resolveOnce = (file: string): Promise<string | null> => {
    const cached = resolutions.get(file);
    if (cached) return cached;
    const pending = deps.resolveExecutable(file);
    resolutions.set(file, pending);
    return pending;
  };

  return async (file, args, options) => {
    const resolved = await resolveOnce(file);
    const launch = planWindowsLaunch(file, args, resolved, deps.comspec);
    return deps.execFileAsync(launch.file, launch.args, {
      ...options,
      ...(launch.verbatim ? { windowsVerbatimArguments: true } : {}),
      windowsHide: true,
    });
  };
}
