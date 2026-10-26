/**
 * CLI Server Test Helper
 *
 * Utility for starting and stopping long-running CLI server commands in E2E tests.
 * Designed for commands like `shep ui` that spawn an HTTP server and run until terminated.
 *
 * Uses spawn() for non-blocking process management with stdout monitoring
 * to detect server readiness.
 *
 * @example
 * import { startCliServer, waitForServer } from '@tests/helpers/cli/server';
 *
 * const server = await startCliServer('--port 4050');
 * await waitForServer(`http://localhost:${server.port}`);
 * // ... run tests against server ...
 * await server.stop();
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Handle to a running CLI server process
 */
export interface ServerProcess {
  /** The underlying child process */
  process: ChildProcess;
  /** The port the server is listening on */
  port: number;
  /** Gracefully stop the server (SIGTERM, then SIGKILL after 10s) */
  stop: () => Promise<void>;
}

/** Project root directory */
const PROJECT_ROOT = resolve(__dirname, '../../..');

/** Path to CLI entry point (TypeScript via tsx) */
const CLI_PATH_DEV = resolve(PROJECT_ROOT, 'src/presentation/cli/index.ts');

/** Default timeout for server startup (Next.js compilation can be slow) */
const DEFAULT_STARTUP_TIMEOUT = 120_000;

/** Timeout before force-killing a server process */
const FORCE_KILL_TIMEOUT = 5_000;

/** Regex to extract port from server ready message */
const SERVER_READY_PATTERN = /Server ready at http:\/\/localhost:(\d+)/;

/**
 * Start a CLI server process (e.g., `shep ui`) and wait for it to be ready.
 *
 * Spawns the CLI via tsx, monitors stdout for the "Server ready" message,
 * and returns a handle to control the process.
 *
 * @param args - Arguments to pass after `ui` (e.g., '--port 4050')
 * @param options - Configuration options
 * @param options.timeout - Maximum time to wait for server ready (default: 120s)
 * @param options.env - Extra environment for the server (e.g. SHEP_HOME)
 * @returns Server process handle with port and stop function
 * @throws Error if server fails to start within the timeout
 *
 * @example
 * const server = await startCliServer('--port 0');
 * console.log(`Server running on port ${server.port}`);
 * await server.stop();
 */
export async function startCliServer(
  args = '',
  options?: { timeout?: number; env?: Record<string, string> }
): Promise<ServerProcess> {
  const timeout = options?.timeout ?? DEFAULT_STARTUP_TIMEOUT;

  const command = 'npx';
  const commandArgs = [
    'tsx',
    CLI_PATH_DEV,
    'ui',
    '--no-open',
    ...args.split(/\s+/).filter(Boolean),
  ];

  const isWindows = process.platform === 'win32';

  const child = spawn(command, commandArgs, {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ...options?.env,
      // Strip ANSI codes for consistent output parsing
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    // On Unix, create a process group so we can kill npx → tsx → node tree together.
    // On Windows, detached creates a new console window; we use taskkill /T instead.
    detached: !isWindows,
    // On Windows, spawn('npx', ...) fails with ENOENT because npx is a .cmd script.
    // shell: true lets the OS resolve npx.cmd automatically.
    shell: isWindows,
  });

  let output = '';

  return new Promise<ServerProcess>((resolvePromise, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        killProcessGroup(child, 'SIGKILL');
        reject(
          new Error(
            `Server failed to start within ${timeout}ms.\n` +
              `Command: ${command} ${commandArgs.join(' ')}\n` +
              `Output:\n${output}`
          )
        );
      }
    }, timeout);

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;

      const match = output.match(SERVER_READY_PATTERN);
      if (match && !settled) {
        settled = true;
        clearTimeout(timeoutId);

        const port = parseInt(match[1], 10);

        resolvePromise({
          process: child,
          port,
          stop: () => stopServer(child),
        });
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        reject(
          new Error(
            `Failed to spawn server process: ${error.message}\n` +
              `Command: ${command} ${commandArgs.join(' ')}\n` +
              `Output:\n${output}`
          )
        );
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        reject(
          new Error(
            `Server process exited unexpectedly with code ${code}.\n` +
              `Command: ${command} ${commandArgs.join(' ')}\n` +
              `Output:\n${output}`
          )
        );
      }
    });
  });
}

/**
 * Kill an entire process group by negating the PID.
 * On Windows, uses taskkill /T to kill the process tree.
 * Falls back to child.kill() if process.kill fails.
 */
function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform === 'win32') {
    // On Windows, kill the entire process tree using taskkill
    try {
      if (child.pid) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    } catch {
      try {
        child.kill(signal);
      } catch {
        // Already dead
      }
    }
    return;
  }

  try {
    // Negative PID kills the entire process group (npx → tsx → node)
    if (child.pid) {
      process.kill(-child.pid, signal);
    }
  } catch {
    // Process group may already be dead, try direct kill as fallback
    try {
      child.kill(signal);
    } catch {
      // Already dead
    }
  }
}

/**
 * Gracefully stop a server process.
 *
 * Sends SIGTERM to the entire process group and waits for exit.
 * If it does not exit within FORCE_KILL_TIMEOUT, sends SIGKILL.
 */
async function stopServer(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    if (child.exitCode !== null || child.killed) {
      resolvePromise();
      return;
    }

    const forceKillTimeout = setTimeout(() => {
      killProcessGroup(child, 'SIGKILL');
      // Resolve after a brief delay even if close event doesn't fire
      setTimeout(resolvePromise, 500);
    }, FORCE_KILL_TIMEOUT);

    child.on('close', () => {
      clearTimeout(forceKillTimeout);
      resolvePromise();
    });

    killProcessGroup(child, 'SIGTERM');
  });
}

/**
 * Poll a URL until it responds with HTTP 200.
 *
 * Useful for waiting until a server is fully ready to handle requests
 * after the initial startup message.
 *
 * @param url - URL to poll (e.g., 'http://localhost:4050')
 * @param timeout - Maximum time to wait in milliseconds (default: 30s)
 * @throws Error if server does not respond with 200 within the timeout
 *
 * @example
 * await waitForServer('http://localhost:4050', 60_000);
 */
export async function waitForServer(url: string, timeout = 30_000): Promise<void> {
  const pollInterval = 500;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet, retry
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error(`Server at ${url} did not respond with 200 within ${timeout}ms`);
}
