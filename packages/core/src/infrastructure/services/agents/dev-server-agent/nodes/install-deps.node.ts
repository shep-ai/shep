/**
 * install_deps node — staleness-aware, log-streamed dependency installation.
 *
 * Skips entirely when the plan's dependencies are already fresh (lockfile
 * hash matches the stamp AND, when a package manager is configured,
 * `node_modules` exists) — the stamp is treated as covering both the
 * package-manager install AND the plan's `setupCommands`, so a fresh hit
 * skips both. Otherwise it reports the `Installing` state transition
 * (bridged by the caller via {@link InstallDepsNodeDeps.reportInstalling}),
 * runs the package-manager install (when configured), then each
 * `setupCommands` entry sequentially in `plan.cwd`, and — only on full
 * success — stamps the post-install hash onto the run-plan row.
 *
 * Never throws: every expected failure (install failure, setup-command
 * failure, missing run plan) is surfaced as a `failureReason` state update
 * so the graph can route to remediation instead of crashing.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import type { IDevServerRunPlanRepository } from '@/application/ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { DependencyInstaller } from '@/infrastructure/services/deployment/dependency-installer.js';
import { buildDevServerEnv } from '@/infrastructure/services/deployment/dev-server-env.js';
import { createLineSplitter } from '@/infrastructure/services/deployment/line-splitter.js';
import { IS_WINDOWS } from '@/infrastructure/platform.js';
import type { DevServerAgentNodeFn } from '../types.js';

const DEFAULT_INSTALL_TIMEOUT_MS = 600_000; // 10 minutes
const SETUP_COMMAND_TIMEOUT_MS = 300_000; // 5 minutes
const MAX_SETUP_TAIL_LINES = 50;
const CAPTURED_LOGS_LIMIT = 100;

const NO_RUN_PLAN_REASON = 'No run plan available for dependency installation';

export interface ExecSetupCommandResult {
  success: boolean;
  tail: string[];
}

/**
 * Dependencies for the install_deps node. All injected so the node stays
 * unit-testable without a filesystem or a spawned process.
 */
export interface InstallDepsNodeDeps {
  installer: Pick<DependencyInstaller, 'install'>;
  runPlanRepository: Pick<IDevServerRunPlanRepository, 'stampInstallHash'>;
  /** Fingerprints the strongest install-staleness signal for a directory. */
  computeInstallHash: (dir: string) => string;
  /** Existence check (injected so tests never touch the real filesystem). */
  pathExists: (p: string) => boolean;
  /** Runs one setupCommands entry; defaults to {@link execSetupCommandDefault}. */
  execSetupCommand?: (
    command: string,
    cwd: string,
    onLine: (line: string) => void
  ) => Promise<ExecSetupCommandResult>;
  /** Bridges the DeploymentState.Installing transition (wired by task-11). */
  reportInstalling: () => void;
  log: (line: string) => void;
  installTimeoutMs?: number;
}

/**
 * Default `execSetupCommand` implementation: runs `command` through the
 * shell (setup commands are arbitrary shell strings, unlike the
 * package-manager install argv), streams stdout/stderr lines to `onLine`,
 * keeps a rolling last-50-line tail, and never rejects — spawn errors,
 * non-zero exits, and timeouts all resolve with `success: false`.
 */
export async function execSetupCommandDefault(
  command: string,
  cwd: string,
  onLine: (line: string) => void
): Promise<ExecSetupCommandResult> {
  return new Promise((resolve) => {
    const tail: string[] = [];
    let settled = false;

    const capture = (line: string): void => {
      tail.push(line);
      if (tail.length > MAX_SETUP_TAIL_LINES) {
        tail.shift();
      }
      onLine(line);
    };

    const finish = (result: ExecSetupCommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    let child: ChildProcess;
    try {
      child = spawn(command, {
        shell: true,
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildDevServerEnv(process.env, { CI: '1' }),
        ...(IS_WINDOWS ? { windowsHide: true } : {}),
      });
    } catch (err) {
      capture(`spawn threw: ${(err as Error).message}`);
      resolve({ success: false, tail: [...tail] });
      return;
    }

    const stdoutSplitter = createLineSplitter(capture);
    const stderrSplitter = createLineSplitter(capture);

    child.stdout?.on('data', (chunk: Buffer) => stdoutSplitter.push(chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => stderrSplitter.push(chunk.toString()));

    const timer = setTimeout(() => {
      stdoutSplitter.flush();
      stderrSplitter.flush();
      capture(`Setup command timed out after ${SETUP_COMMAND_TIMEOUT_MS}ms — killing process`);
      try {
        child.kill('SIGKILL');
      } catch {
        // Process may already be dead.
      }
      finish({ success: false, tail: [...tail] });
    }, SETUP_COMMAND_TIMEOUT_MS);

    child.on('error', (err) => {
      capture(`spawn error: ${err.message}`);
      finish({ success: false, tail: [...tail] });
    });

    child.on('close', (code) => {
      stdoutSplitter.flush();
      stderrSplitter.flush();
      finish({ success: code === 0, tail: [...tail] });
    });
  });
}

/** Cap a log buffer to its last `limit` entries. */
function capLogs(lines: string[], limit: number): string[] {
  return lines.length > limit ? lines.slice(lines.length - limit) : lines;
}

/**
 * True when the plan's dependencies (and, by convention, its setupCommands)
 * are already satisfied: the install-staleness hash matches the stamp from
 * the last successful install, AND — when a package manager is configured —
 * `node_modules` exists in `cwd`.
 */
function isFresh(
  currentHash: string,
  installStampHash: string | undefined,
  packageManager: string | undefined,
  cwd: string,
  pathExists: (p: string) => boolean
): boolean {
  if (currentHash === '' || currentHash !== installStampHash) return false;
  if (!packageManager) return true;
  return pathExists(join(cwd, 'node_modules'));
}

export function createInstallDepsNode(deps: InstallDepsNodeDeps): DevServerAgentNodeFn {
  const execSetupCommand = deps.execSetupCommand ?? execSetupCommandDefault;
  const installTimeoutMs = deps.installTimeoutMs ?? DEFAULT_INSTALL_TIMEOUT_MS;

  return async (state) => {
    const { runPlan } = state;

    if (runPlan === null) {
      return {
        failureReason: NO_RUN_PLAN_REASON,
        capturedLogs: [NO_RUN_PLAN_REASON],
      };
    }

    const { cwd } = runPlan;
    const currentHash = deps.computeInstallHash(cwd);
    const fresh = isFresh(
      currentHash,
      runPlan.installStampHash,
      runPlan.packageManager,
      cwd,
      deps.pathExists
    );

    if (fresh) {
      return {
        depsInstalled: true,
        capturedLogs: ['dependencies fresh, skipping install…'],
      };
    }

    deps.reportInstalling();

    const logs: string[] = [];
    const onLine = (line: string): void => {
      logs.push(line);
      deps.log(line);
    };

    if (runPlan.packageManager) {
      const installResult = await deps.installer.install(
        cwd,
        runPlan.packageManager,
        onLine,
        installTimeoutMs
      );

      if (!installResult.success) {
        const failureReason = `Dependency install failed (exit ${installResult.exitCode})`;
        logs.push(failureReason);
        return {
          failureReason,
          lastErrorTail: installResult.tail,
          capturedLogs: capLogs(logs, CAPTURED_LOGS_LIMIT),
        };
      }
    }

    for (const command of runPlan.setupCommands) {
      const setupResult = await execSetupCommand(command, cwd, onLine);
      if (!setupResult.success) {
        const failureReason = `Setup command failed: ${command}`;
        logs.push(failureReason);
        return {
          failureReason,
          lastErrorTail: setupResult.tail,
          capturedLogs: capLogs(logs, CAPTURED_LOGS_LIMIT),
        };
      }
    }

    const newHash = deps.computeInstallHash(cwd);
    try {
      await deps.runPlanRepository.stampInstallHash(runPlan.repoPath, newHash);
    } catch (err) {
      // Stamping is an optimization (staleness cache), not correctness — a
      // failed stamp just means the next run re-installs. Never fail here.
      deps.log(`Failed to stamp install hash: ${(err as Error).message}`);
    }

    logs.push('dependencies installed');
    return {
      depsInstalled: true,
      runPlan: { ...runPlan, installStampHash: newHash },
      capturedLogs: capLogs(logs, CAPTURED_LOGS_LIMIT),
    };
  };
}
