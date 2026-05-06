/**
 * run-command
 *
 * Tiny cross-platform subprocess helper used by `shep doctor` diagnostics
 * that need to invoke a CLI tool (e.g. `node --version`, `git --version`).
 * Wraps `node:child_process` so each diagnostic stays focused on its own
 * logic without re-implementing process spawning + timeout handling.
 *
 * Design rules (per `.claude/rules/code-quality.md`):
 *   - No shell — uses `execFile` to avoid Windows argument-escaping bugs.
 *   - `windowsHide: true` so no console window flashes on Windows.
 *   - Always resolves; never rejects. Diagnostics surface failures via
 *     `DiagnosticStatus.Fail`, never via thrown errors.
 */

import { execFile } from 'node:child_process';

export interface RunCommandResult {
  /** Process exit code; -1 when the binary was not found / spawn failed. */
  exitCode: number;
  /** Combined stdout, trimmed. */
  stdout: string;
  /** Combined stderr, trimmed. */
  stderr: string;
  /** Convenience flag — true when stderr / stdout suggests "command not found". */
  notFound: boolean;
}

const DEFAULT_TIMEOUT_MS = 2500;

export function runCommand(
  binary: string,
  args: readonly string[],
  options: { cwd?: string; timeoutMs?: number } = {}
): Promise<RunCommandResult> {
  return new Promise((resolve) => {
    execFile(
      binary,
      [...args],
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        windowsHide: true,
        encoding: 'utf8',
      },
      (err, stdout, stderr) => {
        const out = (stdout ?? '').toString().trim();
        const errOut = (stderr ?? '').toString().trim();
        if (!err) {
          resolve({ exitCode: 0, stdout: out, stderr: errOut, notFound: false });
          return;
        }
        const code = (err as NodeJS.ErrnoException).code;
        const exitCode = typeof err === 'object' && 'code' in err ? Number(err.code) : -1;
        const notFound = code === 'ENOENT';
        resolve({
          exitCode: Number.isFinite(exitCode) ? exitCode : -1,
          stdout: out,
          stderr: errOut || (err as Error).message,
          notFound,
        });
      }
    );
  });
}
