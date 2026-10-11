import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';
import { PtyTerminalSessionService } from '../../../../../packages/core/src/infrastructure/services/terminal/pty-terminal-session.service.js';

/**
 * How long to wait for a closed shell to actually exit before falling back to
 * the retrying removal. Generous because ConPTY teardown on a loaded Windows
 * runner is slow; the wait resolves as soon as the exit event lands, so the
 * ceiling is only ever paid when something has genuinely gone wrong.
 */
const SHELL_EXIT_TIMEOUT_MS = 5_000;

/**
 * Close a session and wait for the shell process to actually die.
 *
 * `close()` only *signals* the pty — the child exits asynchronously and keeps
 * a handle on its working directory until it does, so removing that directory
 * straight after `close()` fails with `EBUSY` on Windows.
 *
 * Subscribing BEFORE closing is what makes the wait reliable: `close()` drops
 * the session from the registry, so a listener attached afterwards would never
 * be reached.
 */
function closeAndWaitForExit(service: PtyTerminalSessionService, sessionId: string): Promise<void> {
  return new Promise<void>((resolve) => {
    // Never let a missed exit event hang the suite — the caller's removal is
    // retried anyway, so a timeout degrades to the old behaviour, not a fail.
    const timer = setTimeout(resolve, SHELL_EXIT_TIMEOUT_MS);
    timer.unref();

    service.subscribe(
      sessionId,
      () => {
        /* output is irrelevant here — only the exit matters */
      },
      () => {
        clearTimeout(timer);
        resolve();
      }
    );

    service.close(sessionId);
  });
}

const IS_WINDOWS = process.platform === 'win32';

/** Upper bound for the shell to print its first prompt. */
const SHELL_READY_TIMEOUT_MS = 15_000;

/** Resolve once the session has produced output, i.e. the shell is up. */
function waitForFirstOutput(service: PtyTerminalSessionService, sessionId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('shell printed nothing')),
      SHELL_READY_TIMEOUT_MS
    );
    const unsubscribe = service.subscribe(sessionId, () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

/**
 * Child processes of this test process, for the failure message: when the cwd
 * stays locked, the list names whatever survived the close.
 */
function describeChildProcesses(): string {
  try {
    return execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "ParentProcessId=${process.pid}" | ` +
          'Select-Object ProcessId,Name,CommandLine | Format-List | Out-String -Width 400',
      ],
      { encoding: 'utf8' }
    );
  } catch (error) {
    return `(process listing failed: ${String(error)})`;
  }
}

describe('PtyTerminalSessionService', () => {
  it('rejects non-existent working directory with ENOENT error', () => {
    const service = new PtyTerminalSessionService();
    const nonExistentPath = '/this/path/does/not/exist/surely';

    expect(() => {
      service.create({ cwd: nonExistentPath });
    }).toThrow(/Working directory does not exist/);
  });

  it('rejects non-directory paths', () => {
    const service = new PtyTerminalSessionService();
    const tempDir = mkdtempSync(join(tmpdir(), 'shep-test-'));
    const filePath = join(tempDir, 'file.txt');

    // Create a file instead of a directory
    writeFileSync(filePath, 'test content');

    try {
      expect(() => {
        service.create({ cwd: filePath });
      }).toThrow(/Working directory is not a directory/);
    } finally {
      removeDirWithRetry(tempDir);
    }
  });

  it('creates terminal successfully with valid working directory', async () => {
    const service = new PtyTerminalSessionService();
    const tempDir = mkdtempSync(join(tmpdir(), 'shep-test-'));

    try {
      const result = service.create({
        cwd: tempDir,
        cols: 80,
        rows: 24,
      });

      expect(result.id).toBeDefined();
      expect(result.shell).toBeDefined();
      expect(result.cwd).toBe(tempDir);

      // Clean up the terminal session — and wait for the shell to release
      // tempDir before the `finally` below tries to remove it.
      await closeAndWaitForExit(service, result.id);
    } finally {
      removeDirWithRetry(tempDir);
    }
  });

  it.runIf(IS_WINDOWS)(
    'releases the session cwd once close resolves (#927)',
    async () => {
      const service = new PtyTerminalSessionService();
      const tempDir = mkdtempSync(join(tmpdir(), 'shep-test-'));

      try {
        const { id, shell } = service.create({ cwd: tempDir });
        await waitForFirstOutput(service, id);

        await service.close(id);

        // No retry budget: once close resolves, nothing may still hold the cwd.
        let removalError: unknown = null;
        try {
          rmSync(tempDir, { recursive: true });
        } catch (error) {
          removalError = error;
        }
        expect(
          removalError,
          `shell ${shell}; children after close:\n${describeChildProcesses()}`
        ).toBeNull();
      } finally {
        removeDirWithRetry(tempDir);
      }
    },
    30_000
  );
});
