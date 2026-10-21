/**
 * The `SpawnFunction` every CLI agent executor is constructed with.
 *
 * On Linux and macOS it IS `child_process.spawn`: argv arrays with no shell
 * are already safe and need no lookup, so nothing changes there.
 *
 * On Windows, npm installs agent CLIs as `.cmd` shims (`codex.cmd`,
 * `gemini.cmd`, `copilot.cmd`, …) and a shell-less `spawn('codex')` cannot
 * launch one — libuv only tries `.com` / `.exe` — so those agents failed
 * with ENOENT. This function asks `windows-shim-resolver.ts` whether the
 * command is ONLY reachable as a shim; if so it is launched through cmd.exe
 * with an escaped verbatim command line (`windows-launch.ts`), otherwise the
 * call is passed through exactly as before. The lookup uses the PATH and cwd
 * the child will receive (`options.env`, which a space environment may have
 * changed, and `options.cwd`).
 *
 * No resolution cache: an agent spawn is rare next to the git calls the
 * `ExecFunction` caches for, and a cached miss would hide a CLI the user
 * installs while shep is running.
 */

import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { IS_WINDOWS } from '../../platform.js';
import { planWindowsLaunch, resolveComspec } from './windows-launch.js';
import { findWindowsShim, isRegularFile, type Environment } from './windows-shim-resolver.js';
import type { SpawnFunction } from '../agents/common/types.js';

export interface SpawnFunctionDeps {
  /** True on win32, where shims need resolving. */
  isWindows: boolean;
  /** The underlying `child_process.spawn`. */
  spawn: SpawnFunction;
  /**
   * The `.cmd` / `.bat` to run through cmd.exe, or null when `spawn` can
   * launch the command unaided (see `windows-shim-resolver.ts`).
   */
  findShim: (command: string, env: Environment, cwd: string) => string | null;
  /** Path to cmd.exe. */
  comspec: string;
}

const defaultSpawn: SpawnFunction = (command, args, options) =>
  nodeSpawn(command, args, (options ?? {}) as SpawnOptions);

const defaultFindShim: SpawnFunctionDeps['findShim'] = (command, env, cwd) =>
  findWindowsShim(command, { env, cwd, isFile: isRegularFile });

/**
 * Build the Windows-aware `SpawnFunction`.
 *
 * @param overrides - Injection seams for tests; production passes none.
 */
export function createSpawnFunction(overrides: Partial<SpawnFunctionDeps> = {}): SpawnFunction {
  const deps: SpawnFunctionDeps = {
    isWindows: IS_WINDOWS,
    spawn: defaultSpawn,
    findShim: defaultFindShim,
    comspec: resolveComspec(),
    ...overrides,
  };

  if (!deps.isWindows) {
    return (command, args, options) => deps.spawn(command, args, options);
  }

  return (command, args, options) => {
    const spawnOptions = (options ?? {}) as SpawnOptions;
    // A caller that chose a shell owns its quoting; don't wrap it in another.
    if (spawnOptions.shell) return deps.spawn(command, args, options);

    const cwd = typeof spawnOptions.cwd === 'string' ? spawnOptions.cwd : process.cwd();
    const shim = deps.findShim(command, spawnOptions.env ?? process.env, cwd);
    const launch = planWindowsLaunch(command, args, shim, deps.comspec);
    return deps.spawn(
      launch.file,
      launch.args,
      launch.verbatim ? { ...spawnOptions, windowsVerbatimArguments: true } : options
    );
  };
}
