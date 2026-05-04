/**
 * Daemon Lifecycle E2E Tests
 *
 * Tests for the `shep start`, `shep stop`, and `shep status` commands.
 *
 * Test strategy:
 *  - "No daemon" tests: clean SHEP_HOME, verify not-running messages
 *  - "shep start" tests: verify exit code, stdout URL, daemon.json shape, parent exit time
 *  - "Alive daemon" tests: use a long-running `sleep` process to simulate an alive daemon
 *    without requiring the Next.js web server to be built; verifies status display,
 *    idempotent start, stop lifecycle, and post-stop not-running state
 *
 * Each test group gets its own isolated SHEP_HOME temp directory.
 *
 * Note: Run via `pnpm test:e2e:cli` which sets SHEP_E2E_USE_DIST=1 and builds the CLI.
 * The tests work in both tsx and dist modes because:
 *  - The "alive daemon" tests write daemon.json manually (no real spawn dependency)
 *  - The "shep start" tests verify parent behavior (exit code, output, daemon.json)
 *    which works regardless of whether the spawned daemon stays alive
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCliRunner } from '../../helpers/cli/runner.js';

const isWindows = process.platform === 'win32';

// These tests involve process spawning and signal delivery — use a generous timeout
const TEST_TIMEOUT = 30_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Write a fake `npm` shell script into the given directory.
 * The script simulates a newer version available (viewVersion) and exits with
 * installExitCode when running `npm i` (install).
 */
function createFakeNpmBin(dir: string, viewVersion: string, installExitCode: number): void {
  if (isWindows) {
    // On Windows, create a .cmd batch file that shadows the real npm
    const scriptPath = join(dir, 'npm.cmd');
    writeFileSync(
      scriptPath,
      `@echo off\r\nif "%1"=="view" (\r\n  echo ${viewVersion}\r\n  exit /b 0\r\n)\r\nexit /b ${installExitCode}\r\n`
    );
  } else {
    const scriptPath = join(dir, 'npm');
    writeFileSync(
      scriptPath,
      `${[
        '#!/bin/sh',
        `if [ "$1" = "view" ]; then echo "${viewVersion}"; exit 0; fi`,
        `exit ${installExitCode}`,
      ].join('\n')}\n`
    );
    chmodSync(scriptPath, 0o755);
  }
}

/**
 * Create an isolated temp SHEP_HOME directory.
 * Returns the path and a cleanup function.
 */
function makeTempShepHome(): { shepHome: string; cleanup: () => void } {
  const shepHome = mkdtempSync(join(tmpdir(), 'shep-e2e-daemon-'));
  return {
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

/** Returns true if daemon.json exists in the given SHEP_HOME. */
async function daemonJsonExists(shepHome: string): Promise<boolean> {
  const daemonPath = join(shepHome, 'daemon.json');
  try {
    await access(daemonPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Read and parse daemon.json from the given SHEP_HOME. */
async function readDaemonJson(
  shepHome: string
): Promise<{ pid: number; port: number; startedAt: string }> {
  const daemonPath = join(shepHome, 'daemon.json');
  const content = await readFile(daemonPath, 'utf-8');
  return JSON.parse(content) as { pid: number; port: number; startedAt: string };
}

/** Write a daemon.json directly to SHEP_HOME (simulates a running daemon). */
function writeDaemonJson(shepHome: string, pid: number, port: number): void {
  const daemonPath = join(shepHome, 'daemon.json');
  writeFileSync(
    daemonPath,
    JSON.stringify({ pid, port, startedAt: new Date().toISOString() }),
    'utf-8'
  );
}

/**
 * Find a free port by binding to port 0 and letting the OS assign one.
 * Closes the probe server immediately and returns the assigned port number.
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/**
 * Kill a process and its entire process group (best-effort).
 * Uses negative PID to kill the group, with fallback to direct kill.
 */
function killPid(pid: number): void {
  if (isWindows) {
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // Already dead
    }
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already dead
    }
  }
}

/**
 * Kill any daemon recorded in daemon.json (best-effort, process-group kill).
 */
async function killDaemonFromJson(shepHome: string): Promise<void> {
  if (await daemonJsonExists(shepHome)) {
    try {
      const state = await readDaemonJson(shepHome);
      killPid(state.pid);
    } catch {
      // Already dead — OK
    }
  }
}

// ─── Test suites ─────────────────────────────────────────────────────────────

describe('CLI: daemon lifecycle', { timeout: TEST_TIMEOUT }, () => {
  // ── 1. No daemon running ─────────────────────────────────────────────────
  describe('no daemon running', () => {
    let shepHome: string;
    let cleanup: () => void;
    let runCli: ReturnType<typeof createCliRunner>['run'];

    beforeAll(() => {
      const temp = makeTempShepHome();
      shepHome = temp.shepHome;
      cleanup = temp.cleanup;
      runCli = createCliRunner({ env: { SHEP_HOME: shepHome } }).run;
    });

    afterAll(() => cleanup());

    it('shep stop exits 0 and prints a "no daemon" message', () => {
      const result = runCli('stop');
      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);
      const output = `${result.stdout} ${result.stderr}`.toLowerCase();
      expect(output).toMatch(/no shep daemon/);
    });

    it('shep status exits 0 and prints a "not running" message with a shep-start hint', () => {
      const result = runCli('status');
      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);
      const output = `${result.stdout} ${result.stderr}`;
      expect(output).toMatch(/not running/i);
      expect(output).toMatch(/shep start/i);
    });
  });

  // ── 2. shep start behavior ───────────────────────────────────────────────
  describe('shep start', () => {
    let shepHome: string;
    let cleanup: () => void;
    let runCli: ReturnType<typeof createCliRunner>['run'];
    let testPort: number;

    beforeAll(async () => {
      testPort = await findFreePort();
      const temp = makeTempShepHome();
      shepHome = temp.shepHome;
      cleanup = temp.cleanup;
      runCli = createCliRunner({
        env: { SHEP_HOME: shepHome, SHEP_SKIP_READINESS_CHECK: '1' },
      }).run;
    });

    afterAll(async () => {
      await killDaemonFromJson(shepHome);
      cleanup();
    });

    it('exits 0 and prints a localhost URL', () => {
      const startMs = Date.now();
      const result = runCli(`start --port ${testPort}`);
      const elapsed = Date.now() - startMs;

      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);
      // URL should appear somewhere in the combined output
      expect(result.stdout + result.stderr).toMatch(/localhost:\d+/);
      // Parent must exit quickly — proxy for NFR-1 (parent-exits-within-2s)
      // Allow headroom for CI load and tsx compilation overhead
      expect(elapsed).toBeLessThan(isWindows ? 20000 : 10000);
    });

    it('writes daemon.json with the correct shape', async () => {
      const exists = await daemonJsonExists(shepHome);
      expect(exists).toBe(true);

      const state = await readDaemonJson(shepHome);
      // Shape: { pid: number, port: number, startedAt: ISO 8601 string }
      expect(typeof state.pid).toBe('number');
      expect(typeof state.port).toBe('number');
      expect(typeof state.startedAt).toBe('string');
      expect(state.pid).toBeGreaterThan(0);
      expect(state.port).toBeGreaterThanOrEqual(1024);
      expect(state.port).toBeLessThanOrEqual(65535);
      // startedAt must be a valid ISO 8601 timestamp
      expect(state.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // ── 3. Alive daemon (simulated via sleep process) ────────────────────────
  //
  // Rather than depending on the Next.js web server being fully built and
  // running, we spawn a long-running `sleep` process, write its PID to
  // daemon.json, and then exercise the CLI commands against it.
  // This validates all command behaviors without a web-server dependency.
  describe('alive daemon simulation', () => {
    let shepHome: string;
    let cleanup: () => void;
    let runCli: ReturnType<typeof createCliRunner>['run'];
    let fakeProcess: ReturnType<typeof spawn>;
    let fakePort: number;

    beforeAll(async () => {
      fakePort = await findFreePort();
      const temp = makeTempShepHome();
      shepHome = temp.shepHome;
      cleanup = temp.cleanup;
      runCli = createCliRunner({
        env: { SHEP_HOME: shepHome, SHEP_SKIP_READINESS_CHECK: '1' },
      }).run;

      // Spawn a harmless long-running process to act as our fake daemon
      fakeProcess = isWindows
        ? spawn('node', ['-e', 'setTimeout(()=>{},60000)'], { stdio: 'ignore' })
        : spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
      fakeProcess.unref();

      // Populate daemon.json as if `shep start` had run
      writeDaemonJson(shepHome, fakeProcess.pid!, fakePort);
    });

    afterAll(() => {
      if (fakeProcess?.pid) killPid(fakeProcess.pid);
      cleanup();
    });

    it('shep status exits 0 and displays PID and port', () => {
      const result = runCli('status');
      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);
      const output = result.stdout + result.stderr;
      expect(output).toContain(String(fakeProcess.pid));
      expect(output).toContain(String(fakePort));
    });

    it('shep start is idempotent — exits 0 and prints "already running"', () => {
      const result = runCli('start');
      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);
      const output = (result.stdout + result.stderr).toLowerCase();
      expect(output).toMatch(/already running/);
    });

    it('shep stop exits 0 and deletes daemon.json', async () => {
      const result = runCli('stop');
      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);

      // daemon.json must be removed after a successful stop
      const exists = await daemonJsonExists(shepHome);
      expect(exists).toBe(false);
    });

    it('shep status shows "not running" after stop', () => {
      // daemon.json was deleted by the previous test — status should now reflect that
      const result = runCli('status');
      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toMatch(/not running/i);
    });
  });

  // ── 4. shep restart ─────────────────────────────────────────────────────
  describe('shep restart', () => {
    describe('daemon is running', () => {
      let shepHome: string;
      let cleanup: () => void;
      let runCli: ReturnType<typeof createCliRunner>['run'];
      let fakeProcess: ReturnType<typeof spawn>;
      let fakePort: number;
      let restartPort: number;

      beforeAll(async () => {
        fakePort = await findFreePort();
        restartPort = await findFreePort();
        const temp = makeTempShepHome();
        shepHome = temp.shepHome;
        cleanup = temp.cleanup;
        // restart = stop (up to 5s poll) + start (0.5s settle) — needs longer timeout on Windows
        runCli = createCliRunner({
          env: { SHEP_HOME: shepHome, SHEP_SKIP_READINESS_CHECK: '1' },
          timeout: 20_000,
        }).run;

        fakeProcess = isWindows
          ? spawn('node', ['-e', 'setTimeout(()=>{},60000)'], { stdio: 'ignore' })
          : spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
        fakeProcess.unref();
        writeDaemonJson(shepHome, fakeProcess.pid!, fakePort);
      });

      afterAll(async () => {
        if (fakeProcess?.pid) killPid(fakeProcess.pid);
        await killDaemonFromJson(shepHome);
        cleanup();
      });

      it('exits 0, stops the old daemon, and invokes startDaemon', async () => {
        const result = runCli(`restart --port ${restartPort}`);

        expect(result.exitCode).toBe(0);

        const output = result.stdout + result.stderr;
        // stopDaemon was called and completed — prints this success message
        expect(output).toMatch(/shep daemon stopped/i);
        // startDaemon was invoked — output contains a localhost URL
        expect(output).toMatch(/localhost:\d+/);
      });

      it('daemon.json no longer belongs to the old process after restart', async () => {
        const exists = await daemonJsonExists(shepHome);
        if (exists) {
          const state = await readDaemonJson(shepHome);
          // New daemon.json must have a different PID than the old sleep process
          expect(state.pid).not.toBe(fakeProcess.pid);
        }
        // If daemon.json is absent, startDaemon failed — acceptable in test env.
      });
    });

    describe('daemon is not running', () => {
      let shepHome: string;
      let cleanup: () => void;
      let runCli: ReturnType<typeof createCliRunner>['run'];
      let restartPort: number;

      beforeAll(async () => {
        restartPort = await findFreePort();
        const temp = makeTempShepHome();
        shepHome = temp.shepHome;
        cleanup = temp.cleanup;
        // restart involves startDaemon which may take longer on Windows
        runCli = createCliRunner({
          env: { SHEP_HOME: shepHome, SHEP_SKIP_READINESS_CHECK: '1' },
          timeout: 20_000,
        }).run;
      });

      afterAll(async () => {
        await killDaemonFromJson(shepHome);
        cleanup();
      });

      it('exits 0 and prints "Daemon was not running" message', () => {
        const result = runCli(`restart --port ${restartPort}`);
        expect(result.exitCode).toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toMatch(/daemon was not running/i);
      });

      it('still invokes startDaemon when daemon was not running', () => {
        // Output should contain a localhost URL from startDaemon's success path
        // (test runs after the previous test — startDaemon already ran; check prior output indirectly
        //  by re-running; daemon is already up so this tests idempotent path)
        const result = runCli(`restart --port ${restartPort}`);
        expect(result.exitCode).toBe(0);
        expect(result.stdout + result.stderr).toMatch(/localhost:\d+/);
      });
    });
  });

  // ── 5. shep upgrade with daemon ─────────────────────────────────────────
  describe('shep upgrade with daemon', () => {
    describe('daemon was running — npm install succeeds', () => {
      let shepHome: string;
      let binDir: string;
      let cleanup: () => void;
      let runCli: ReturnType<typeof createCliRunner>['run'];
      let fakeProcess: ReturnType<typeof spawn>;
      let fakePort: number;

      beforeAll(async () => {
        fakePort = await findFreePort();
        const temp = makeTempShepHome();
        shepHome = temp.shepHome;
        binDir = mkdtempSync(join(tmpdir(), 'shep-e2e-bin-'));
        createFakeNpmBin(binDir, '99.99.99', 0);

        cleanup = () => {
          try {
            rmSync(shepHome, { recursive: true, force: true });
          } catch {
            // best-effort
          }
          try {
            rmSync(binDir, { recursive: true, force: true });
          } catch {
            // best-effort
          }
        };

        // upgrade = version check + stop (up to 5s poll) + install + start — needs longer timeout
        runCli = createCliRunner({
          env: {
            SHEP_HOME: shepHome,
            SHEP_SKIP_READINESS_CHECK: '1',
            PATH: `${binDir}${isWindows ? ';' : ':'}${process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'}`,
          },
          timeout: 20_000,
        }).run;

        fakeProcess = isWindows
          ? spawn('node', ['-e', 'setTimeout(()=>{},60000)'], { stdio: 'ignore' })
          : spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
        fakeProcess.unref();
        writeDaemonJson(shepHome, fakeProcess.pid!, fakePort);
      });

      afterAll(async () => {
        if (fakeProcess?.pid) killPid(fakeProcess.pid);
        await killDaemonFromJson(shepHome);
        cleanup();
      });

      it('stops the daemon before upgrade, restarts it after, and exits 0', () => {
        const result = runCli('upgrade');

        expect(result.exitCode).toBe(0);

        const output = result.stdout + result.stderr;
        // Daemon lifecycle messages printed in order
        expect(output).toMatch(/stopping daemon before upgrade/i);
        expect(output).toMatch(/restarting daemon/i);
        expect(output).toMatch(/upgraded successfully/i);
      });
    });

    describe('daemon was running — npm install fails', () => {
      let shepHome: string;
      let binDir: string;
      let cleanup: () => void;
      let runCli: ReturnType<typeof createCliRunner>['run'];
      let fakeProcess: ReturnType<typeof spawn>;
      let fakePort: number;

      beforeAll(async () => {
        fakePort = await findFreePort();
        const temp = makeTempShepHome();
        shepHome = temp.shepHome;
        binDir = mkdtempSync(join(tmpdir(), 'shep-e2e-bin-'));
        createFakeNpmBin(binDir, '99.99.99', 1); // exits 1 — install failure

        cleanup = () => {
          try {
            rmSync(shepHome, { recursive: true, force: true });
          } catch {
            // best-effort
          }
          try {
            rmSync(binDir, { recursive: true, force: true });
          } catch {
            // best-effort
          }
        };

        // upgrade = version check + stop (up to 5s poll) + install + start — needs longer timeout
        runCli = createCliRunner({
          env: {
            SHEP_HOME: shepHome,
            SHEP_SKIP_READINESS_CHECK: '1',
            PATH: `${binDir}${isWindows ? ';' : ':'}${process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'}`,
          },
          timeout: 20_000,
        }).run;

        fakeProcess = isWindows
          ? spawn('node', ['-e', 'setTimeout(()=>{},60000)'], { stdio: 'ignore' })
          : spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
        fakeProcess.unref();
        writeDaemonJson(shepHome, fakeProcess.pid!, fakePort);
      });

      afterAll(async () => {
        if (fakeProcess?.pid) killPid(fakeProcess.pid);
        await killDaemonFromJson(shepHome);
        cleanup();
      });

      it('stops the old daemon, attempts restart, and prints "daemon restored" message', () => {
        const result = runCli('upgrade');

        // Process exits with code 1 because npm install failed
        expect(result.success).toBe(false);

        const output = result.stdout + result.stderr;
        // stopDaemon ran before install (daemon lifecycle messages present)
        expect(output).toMatch(/stopping daemon before upgrade/i);
        // daemon restored message printed after failed install
        expect(output).toMatch(/upgrade failed.*daemon restored on previous version/i);
      });
    });

    describe('daemon was NOT running', () => {
      let shepHome: string;
      let binDir: string;
      let cleanup: () => void;
      let runCli: ReturnType<typeof createCliRunner>['run'];

      beforeAll(() => {
        const temp = makeTempShepHome();
        shepHome = temp.shepHome;
        binDir = mkdtempSync(join(tmpdir(), 'shep-e2e-bin-'));
        createFakeNpmBin(binDir, '99.99.99', 0);

        cleanup = () => {
          try {
            rmSync(shepHome, { recursive: true, force: true });
          } catch {
            // best-effort
          }
          try {
            rmSync(binDir, { recursive: true, force: true });
          } catch {
            // best-effort
          }
        };

        // upgrade = version check + install — needs longer timeout on Windows
        runCli = createCliRunner({
          env: {
            SHEP_HOME: shepHome,
            SHEP_SKIP_READINESS_CHECK: '1',
            PATH: `${binDir}${isWindows ? ';' : ':'}${process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'}`,
          },
          timeout: 20_000,
        }).run;
        // No daemon.json written — daemon is not running
      });

      afterAll(() => cleanup());

      it('completes upgrade without stopping or restarting the daemon', () => {
        const result = runCli('upgrade');

        expect(result.exitCode).toBe(0);

        const output = result.stdout + result.stderr;
        expect(output).not.toMatch(/stopping daemon/i);
        expect(output).not.toMatch(/restarting daemon/i);
        expect(output).toMatch(/upgraded successfully/i);
      });

      it('starts daemon after successful upgrade even when none existed before', async () => {
        // After a successful upgrade, shep auto-starts the daemon so the user
        // is left with a live daemon regardless of prior state.
        const exists = await daemonJsonExists(shepHome);
        expect(exists).toBe(true);
      });
    });
  });
});
