/**
 * CLI Test Runner
 *
 * Utility for executing CLI commands in E2E tests.
 * Provides consistent interface for running commands and capturing output.
 *
 * ISOLATION: Each runner uses a unique SHEP_HOME temp directory by default,
 * ensuring parallel test files never share database state.
 *
 * NOTE: Uses execSync intentionally for test simplicity. All inputs are
 * controlled by test code, not user input, so command injection is not a risk.
 *
 * @example
 * import { runCli, createCliRunner } from '@tests/helpers/cli/runner';
 *
 * // Simple usage (auto-isolated)
 * const result = runCli('version');
 *
 * // With custom options
 * const runner = createCliRunner({ cwd: '/custom/path' });
 * const result = runner.run('version');
 *
 * // Lifecycle-managed isolation (recommended for settings tests)
 * const { runner, cleanup } = createIsolatedCliRunner();
 * const result = runner.run('settings show');
 * cleanup(); // removes temp dir
 */

import { execSync, exec, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// exec is used here intentionally for test infrastructure only.
// All command arguments come from test code, not user input.
const execAsync = promisify(exec);

/**
 * Result of a CLI command execution
 */
export interface CliResult {
  /** Standard output */
  stdout: string;
  /** Standard error (empty for successful commands) */
  stderr: string;
  /** Exit code (0 = success) */
  exitCode: number;
  /** Whether the command succeeded */
  success: boolean;
  /**
   * Whether the command was killed for exceeding its timeout rather than
   * exiting on its own. A killed process has no exit status, so `exitCode`
   * falls back to 1 — identical to a real failure. Assert on this flag (or read
   * the note appended to `stderr`) to tell the two apart.
   */
  timedOut: boolean;
}

/**
 * Options for CLI runner
 */
export interface CliRunnerOptions {
  /** Working directory for command execution */
  cwd?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * CLI Runner instance
 */
export interface CliRunner {
  /**
   * Run a CLI command
   * @param args - Command arguments (e.g., 'version', '--help')
   * @returns Command result with stdout, stderr, exitCode
   */
  run: (args: string) => CliResult;

  /**
   * Run a CLI command and expect it to succeed
   * @param args - Command arguments
   * @throws Error if command fails
   */
  runOrThrow: (args: string) => CliResult;
}

/**
 * Isolated CLI Runner with lifecycle management
 */
export interface IsolatedCliRunner {
  /** The CLI runner instance */
  runner: CliRunner;
  /** Path to the isolated SHEP_HOME directory */
  shepHome: string;
  /** Cleanup function to remove the temp directory */
  cleanup: () => void;
}

/** Project root directory */
const PROJECT_ROOT = resolve(__dirname, '../../..');

/** Path to CLI entry point (TypeScript via tsx) */
const CLI_PATH_DEV = resolve(PROJECT_ROOT, 'src/presentation/cli/index.ts');

/** Path to CLI entry point (compiled JS) */
const CLI_PATH_DIST = resolve(PROJECT_ROOT, 'dist/src/presentation/cli/index.js');

/**
 * Whether to use compiled dist/ by default (set via SHEP_E2E_USE_DIST=1).
 * Running against dist/ is ~3.5x faster per spawn since it skips tsx compilation.
 */
const USE_DIST_BY_DEFAULT = !!process.env.SHEP_E2E_USE_DIST;

/**
 * Default runner options
 */
const DEFAULT_OPTIONS: Required<CliRunnerOptions> = {
  cwd: PROJECT_ROOT,
  env: {
    // Use deterministic mock executor for E2E tests (no real AI calls)
    SHEP_MOCK_EXECUTOR: '1',
  },
  timeout: process.platform === 'win32' ? 30000 : 15000,
};

/** Creates a unique temp directory for SHEP_HOME isolation */
function createTempShepHome(): string {
  return mkdtempSync(join(tmpdir(), 'shep-e2e-'));
}

/**
 * Module-level temp dir for auto-isolation.
 * Shared across all runCli() calls in the same test file (vitest worker).
 * Each test file runs in its own worker, so this provides file-level isolation.
 */
let moduleShepHome: string | null = null;

function getModuleShepHome(): string {
  moduleShepHome ??= createTempShepHome();
  return moduleShepHome;
}

/**
 * Execute CLI command and capture result
 *
 * Security: All command arguments come from test code, not user input.
 * execSync is used intentionally for test simplicity.
 */
function executeCommand(
  args: string,
  options: Required<CliRunnerOptions>,
  useDist = USE_DIST_BY_DEFAULT
): CliResult {
  const cliPath = useDist ? CLI_PATH_DIST : CLI_PATH_DEV;
  const runner = useDist ? 'node' : 'npx tsx';
  const command = `${runner} ${cliPath} ${args}`;

  const execOptions: ExecSyncOptionsWithStringEncoding = {
    cwd: options.cwd,
    encoding: 'utf-8',
    timeout: options.timeout,
    env: {
      ...process.env,
      ...options.env,
      // Force no color for consistent test output
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  };

  try {
    const stdout = execSync(command, execOptions);
    return {
      stdout: stdout.trim(),
      stderr: '',
      exitCode: 0,
      success: true,
      timedOut: false,
    };
  } catch (error) {
    const execError = error as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      status?: number | null;
      signal?: string | null;
    };

    // A process that exits on its own always yields a numeric status. A null
    // status means it was killed — for execSync that is the timeout.
    const timedOut = execError.status == null;
    const stderr = String(execError.stderr ?? '').trim();
    const timeoutNote = `[cli-runner] "shep ${args}" timed out after ${options.timeout}ms and was killed (signal=${execError.signal ?? 'unknown'}). exitCode below is a placeholder, not the command's own status.`;

    return {
      stdout: String(execError.stdout ?? '').trim(),
      stderr: timedOut ? [stderr, timeoutNote].filter(Boolean).join('\n') : stderr,
      exitCode: execError.status ?? 1,
      success: false,
      timedOut,
    };
  }
}

/**
 * Create a CLI runner with custom options.
 * Automatically sets SHEP_HOME to a temp directory unless explicitly provided.
 *
 * @param options - Runner configuration
 * @param useDist - Use compiled dist instead of tsx (for production testing)
 * @returns CLI runner instance
 */
export function createCliRunner(
  options: CliRunnerOptions = {},
  useDist = USE_DIST_BY_DEFAULT
): CliRunner {
  // Auto-isolate: set SHEP_HOME to a module-level temp dir unless caller provides one or HOME override.
  // Uses a shared dir per test file (vitest worker) so the database is initialized once per file.
  const needsIsolation = !options.env?.SHEP_HOME && !options.env?.HOME;
  const isolationEnv: Record<string, string> = needsIsolation
    ? { SHEP_HOME: getModuleShepHome() }
    : {};

  const mergedOptions: Required<CliRunnerOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
    env: { ...DEFAULT_OPTIONS.env, ...isolationEnv, ...options.env },
  };

  return {
    run: (args: string) => executeCommand(args, mergedOptions, useDist),

    runOrThrow: (args: string) => {
      const result = executeCommand(args, mergedOptions, useDist);
      if (!result.success) {
        throw new Error(
          `CLI command failed with exit code ${result.exitCode}:\n` +
            `Command: shep ${args}\n` +
            `Stdout: ${result.stdout}\n` +
            `Stderr: ${result.stderr}`
        );
      }
      return result;
    },
  };
}

/**
 * Create an isolated CLI runner with explicit lifecycle management.
 * Use this when tests need a shared isolated state across multiple commands
 * (e.g., configure agent then verify settings).
 *
 * @param options - Runner configuration
 * @returns Runner, shepHome path, and cleanup function
 *
 * @example
 * const { runner, cleanup } = createIsolatedCliRunner();
 * try {
 *   runner.run('settings agent --agent claude-code --auth session');
 *   const result = runner.run('settings show --output json');
 * } finally {
 *   cleanup();
 * }
 */
export function createIsolatedCliRunner(options: CliRunnerOptions = {}): IsolatedCliRunner {
  const shepHome = createTempShepHome();
  const runner = createCliRunner({
    ...options,
    env: { ...options.env, SHEP_HOME: shepHome },
  });

  return {
    runner,
    shepHome,
    cleanup: () => {
      try {
        rmSync(shepHome, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    },
  };
}

/**
 * Run a CLI command with default options (auto-isolated)
 *
 * NOTE: Each call creates a new temp SHEP_HOME. For tests that need
 * state to persist between commands, use createIsolatedCliRunner() instead.
 *
 * @param args - Command arguments
 * @returns Command result
 */
export function runCli(args: string): CliResult {
  const runner = createCliRunner();
  return runner.run(args);
}

/**
 * Run a CLI command asynchronously (non-blocking, auto-isolated)
 *
 * Security: exec is used intentionally here for test infrastructure.
 * All command arguments come from test code, not user input.
 */
export async function runCliAsync(args: string): Promise<CliResult> {
  const shepHome = getModuleShepHome();
  const cliPath = USE_DIST_BY_DEFAULT ? CLI_PATH_DIST : CLI_PATH_DEV;
  const runner = USE_DIST_BY_DEFAULT ? 'node' : 'npx tsx';
  const command = `${runner} ${cliPath} ${args}`;

  const execOptions = {
    cwd: DEFAULT_OPTIONS.cwd,
    encoding: 'utf-8' as const,
    timeout: DEFAULT_OPTIONS.timeout,
    env: {
      ...process.env,
      ...DEFAULT_OPTIONS.env,
      SHEP_HOME: shepHome,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  };

  try {
    const { stdout, stderr } = await execAsync(command, execOptions);
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      success: true,
      timedOut: false,
    };
  } catch (error) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      code?: number | null;
      signal?: string | null;
      killed?: boolean;
    };

    // Same reasoning as executeCommand(): no numeric code means the process was
    // killed rather than exited, which for exec means the timeout elapsed.
    const timedOut = execError.code == null;
    const stderr = String(execError.stderr ?? '').trim();
    const timeoutNote = `[cli-runner] "shep ${args}" timed out after ${DEFAULT_OPTIONS.timeout}ms and was killed (signal=${execError.signal ?? 'unknown'}). exitCode below is a placeholder, not the command's own status.`;

    return {
      stdout: String(execError.stdout ?? '').trim(),
      stderr: timedOut ? [stderr, timeoutNote].filter(Boolean).join('\n') : stderr,
      exitCode: execError.code ?? 1,
      success: false,
      timedOut,
    };
  }
}

/**
 * Run a CLI command and throw if it fails (auto-isolated)
 */
export function runCliOrThrow(args: string): CliResult {
  const runner = createCliRunner();
  return runner.runOrThrow(args);
}
