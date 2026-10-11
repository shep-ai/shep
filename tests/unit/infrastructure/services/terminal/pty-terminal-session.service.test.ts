import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';
import { PtyTerminalSessionService } from '../../../../../packages/core/src/infrastructure/services/terminal/pty-terminal-session.service.js';

const IS_WINDOWS = process.platform === 'win32';

/** Upper bound for the shell to print its first prompt. */
const SHELL_READY_TIMEOUT_MS = 15_000;

/** Ceiling for the Windows teardown tests: host capture + close + listings. */
const WINDOWS_TEARDOWN_TEST_TIMEOUT_MS = 60_000;

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

interface ChildProcess {
  ProcessId: number;
  Name: string;
}

/**
 * Live direct children of this test process (Windows). node-pty starts both
 * the shell and its ConPTY host (`conhost.exe`) as children of the caller, so
 * diffing this list around a session names every process the session owns.
 */
function listChildProcesses(): ChildProcess[] {
  const json = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "ParentProcessId=${process.pid}" | ` +
        'Select-Object ProcessId,Name | ConvertTo-Json -Compress',
    ],
    { encoding: 'utf8' }
  ).trim();
  if (!json) return [];
  const parsed = JSON.parse(json) as ChildProcess | ChildProcess[];
  return Array.isArray(parsed) ? parsed : [parsed];
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

      // close() resolves once the shell has exited and released tempDir.
      await service.close(result.id);
    } finally {
      removeDirWithRetry(tempDir);
    }
  });

  it('resolves close only after the shell has exited', async () => {
    const service = new PtyTerminalSessionService();
    const tempDir = mkdtempSync(join(tmpdir(), 'shep-test-'));

    try {
      const { id } = service.create({ cwd: tempDir });
      let exited = false;
      service.subscribe(
        id,
        () => {
          /* output is irrelevant here — only the exit matters */
        },
        () => {
          exited = true;
        }
      );

      await service.close(id);

      expect(exited).toBe(true);
      expect(service.exists(id)).toBe(false);
    } finally {
      removeDirWithRetry(tempDir);
    }
  });

  it('treats closing an unknown session as a no-op', async () => {
    const service = new PtyTerminalSessionService();
    await expect(service.close('no-such-session')).resolves.toBeUndefined();
  });

  // #927: the ConPTY host (`conhost.exe`) must not outlive a closed session,
  // and nothing may still hold the session's cwd once close() resolves.
  describe.runIf(IS_WINDOWS)('leaves no session process behind on Windows (#927)', () => {
    async function expectCleanTeardown(waitForShell: boolean): Promise<void> {
      const service = new PtyTerminalSessionService();
      const tempDir = mkdtempSync(join(tmpdir(), 'shep-test-'));

      try {
        const before = new Set(listChildProcesses().map((p) => p.ProcessId));
        const { id } = service.create({ cwd: tempDir });
        if (waitForShell) await waitForFirstOutput(service, id);

        await service.close(id);

        const survivors = listChildProcesses().filter(
          (p) => !before.has(p.ProcessId) && p.Name.toLowerCase() !== 'powershell.exe'
        );
        expect(survivors).toEqual([]);
        // No retry budget: once close resolves, nothing may still hold the cwd.
        expect(() => rmSync(tempDir, { recursive: true })).not.toThrow();
      } finally {
        removeDirWithRetry(tempDir);
      }
    }

    it(
      'when closed right after create',
      () => expectCleanTeardown(false),
      WINDOWS_TEARDOWN_TEST_TIMEOUT_MS
    );

    it(
      'when closed after the shell is ready',
      () => expectCleanTeardown(true),
      WINDOWS_TEARDOWN_TEST_TIMEOUT_MS
    );
  });
});
