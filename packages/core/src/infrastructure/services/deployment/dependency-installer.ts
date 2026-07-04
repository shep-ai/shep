/**
 * DependencyInstaller — async, log-streamed package install.
 *
 * Runs a package manager's `install` non-interactively via an async
 * `spawn` (never `execFileSync`/`execSync`, so it never blocks the event
 * loop), streams every stdout/stderr line to a caller-supplied callback as
 * it arrives, and resolves with a summary once the process exits.
 *
 * This class does NOT persist anything: hash *stamping* (recording that an
 * install succeeded for a given `computeInstallHash()` value) is the
 * responsibility of the caller — the `install_deps` graph node — which
 * writes the stamp via the run-plan repository only after `install()`
 * resolves `success: true`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { buildDevServerEnv } from './dev-server-env.js';
import { createLineSplitter } from './line-splitter.js';
import { IS_WINDOWS } from '../../platform.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_TAIL_LINES = 50;

export interface InstallResult {
  success: boolean;
  exitCode: number | null;
  tail: string[];
}

export interface DependencyInstallerDeps {
  spawn: typeof spawn;
}

const defaultDeps: DependencyInstallerDeps = { spawn };

/**
 * Build the non-interactive install args for a given package manager.
 * Unknown package managers fall back to a plain `install`.
 */
function buildInstallArgs(packageManager: string): string[] {
  switch (packageManager) {
    case 'npm':
      return ['install', '--no-audit', '--no-fund'];
    case 'pnpm':
      return ['install'];
    case 'yarn':
      return ['install', '--non-interactive'];
    case 'bun':
      return ['install'];
    default:
      return ['install'];
  }
}

export class DependencyInstaller {
  private readonly deps: DependencyInstallerDeps;

  constructor(deps: Partial<DependencyInstallerDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /**
   * Run `<packageManager> install` (non-interactive) in `dir`, streaming
   * every output line to `onLogLine`. Never rejects — spawn errors,
   * non-zero exits, and timeouts all resolve with `success: false`.
   */
  install(
    dir: string,
    packageManager: string,
    onLogLine: (line: string) => void,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<InstallResult> {
    return new Promise((resolve) => {
      const tail: string[] = [];
      let settled = false;

      const capture = (line: string): void => {
        tail.push(line);
        if (tail.length > MAX_TAIL_LINES) {
          tail.shift();
        }
        onLogLine(line);
      };

      const finish = (result: InstallResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      let child: ChildProcess;
      try {
        child = this.deps.spawn(packageManager, buildInstallArgs(packageManager), {
          shell: true,
          cwd: dir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: buildDevServerEnv(process.env, { CI: '1' }),
          ...(IS_WINDOWS ? { windowsHide: true } : {}),
        });
      } catch (err) {
        capture(`spawn threw: ${(err as Error).message}`);
        resolve({ success: false, exitCode: null, tail: [...tail] });
        return;
      }

      const stdoutSplitter = createLineSplitter(capture);
      const stderrSplitter = createLineSplitter(capture);

      child.stdout?.on('data', (chunk: Buffer) => stdoutSplitter.push(chunk.toString()));
      child.stderr?.on('data', (chunk: Buffer) => stderrSplitter.push(chunk.toString()));

      const timer = setTimeout(() => {
        stdoutSplitter.flush();
        stderrSplitter.flush();
        capture(`Install timed out after ${timeoutMs}ms — killing process`);
        try {
          child.kill('SIGKILL');
        } catch {
          // Process may already be dead.
        }
        finish({ success: false, exitCode: null, tail: [...tail] });
      }, timeoutMs);

      child.on('error', (err) => {
        capture(`spawn error: ${err.message}`);
        finish({ success: false, exitCode: null, tail: [...tail] });
      });

      child.on('close', (code) => {
        stdoutSplitter.flush();
        stderrSplitter.flush();
        finish({ success: code === 0, exitCode: code, tail: [...tail] });
      });
    });
  }
}
