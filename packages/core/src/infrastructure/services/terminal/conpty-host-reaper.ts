/**
 * ConPTY host reaper (Windows).
 *
 * node-pty starts two processes per Windows terminal: the shell, and the
 * pseudo-console host (`conhost.exe`, or `OpenConsole.exe` with the bundled
 * ConPTY DLL) that renders it. Both are children of *our* process, not of
 * each other, so killing the pty and waiting for the shell does not prove the
 * host is gone — on a loaded machine it can outlive the session (#927).
 *
 * This module finds the host serving a given shell by asking Windows for that
 * shell's console host (`NtQueryInformationProcess(ProcessConsoleHostProcess)`)
 * while the shell is still alive, and later terminates exactly that PID if it
 * is still running. It never matches processes by name: an image name is only
 * used to confirm a captured PID has not been reused by an unrelated process.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { injectable } from 'tsyringe';
import { isProcessAlive } from '../process/is-process-alive.js';

const execFileAsync = promisify(execFile);

/** A process identified by PID plus the image it had when it was captured. */
export interface SessionProcess {
  pid: number;
  /** Executable file name, e.g. `conhost.exe` — compared case-insensitively. */
  image: string;
}

/** `PROCESSINFOCLASS.ProcessConsoleHostProcess`. */
const PROCESS_CONSOLE_HOST_PROCESS = 49;

/** `PROCESS_QUERY_LIMITED_INFORMATION` — enough for the console-host query. */
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

/**
 * The low two bits of the returned value are flags, not part of the PID.
 * @see https://learn.microsoft.com/windows/win32/procthread/zwqueryinformationprocess
 */
const CONSOLE_HOST_PID_FLAG_BITS = 3;

/** PowerShell compiles the P/Invoke shim once per call, which takes seconds. */
const HOST_QUERY_TIMEOUT_MS = 15_000;

/** `tasklist` answers in well under a second. */
const IMAGE_QUERY_TIMEOUT_MS = 5_000;

/** How long a terminated process gets to disappear from the process table. */
const PROCESS_EXIT_TIMEOUT_MS = 3_000;

const PROCESS_EXIT_POLL_MS = 50;

/**
 * Prints `<hostPid> <hostImage>` for the shell PID passed as `$args[0]`, or
 * nothing when the shell has no console host (or is already gone).
 */
const CONSOLE_HOST_QUERY_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ShepConsoleHost {
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr handle);
  [DllImport("ntdll.dll")]
  static extern int NtQueryInformationProcess(IntPtr process, int infoClass, out IntPtr info, int length, out int returned);
  public static long Of(int pid) {
    IntPtr process = OpenProcess(${PROCESS_QUERY_LIMITED_INFORMATION}, false, pid);
    if (process == IntPtr.Zero) return 0;
    try {
      IntPtr info; int returned;
      int status = NtQueryInformationProcess(process, ${PROCESS_CONSOLE_HOST_PROCESS}, out info, IntPtr.Size, out returned);
      return status == 0 ? (info.ToInt64() & ~${CONSOLE_HOST_PID_FLAG_BITS}L) : 0;
    } finally { CloseHandle(process); }
  }
}
'@
$hostPid = [ShepConsoleHost]::Of([int]$args[0])
if ($hostPid -gt 0) {
  $name = (Get-Process -Id $hostPid -ErrorAction SilentlyContinue).ProcessName
  if ($name) { "$hostPid $name.exe" }
}
`;

/** Parse the `<pid> <image>` line printed by the console-host query. */
export function parseConsoleHostOutput(stdout: string): SessionProcess | null {
  const match = /^(\d+)\s+(\S.*)$/.exec(stdout.trim());
  if (!match) return null;
  const pid = Number(match[1]);
  return pid > 0 ? { pid, image: match[2].trim() } : null;
}

/**
 * Parse `tasklist /FO CSV /NH` output into the image name of its first row.
 * `tasklist` prints an `INFO:` line instead of a row when no process matches.
 */
export function parseTasklistImage(stdout: string): string | null {
  const match = /^"([^"]+)","\d+"/m.exec(stdout);
  return match ? match[1] : null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@injectable()
export class ConptyHostReaper {
  /**
   * Find the console host serving `shellPid`. Must run while the shell is
   * alive. Resolves `null` when the host cannot be determined — reaping then
   * falls back to the shell alone, which is what node-pty already kills.
   */
  async captureHost(shellPid: number): Promise<SessionProcess | null> {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `& { ${CONSOLE_HOST_QUERY_SCRIPT} } ${shellPid}`,
        ],
        { timeout: HOST_QUERY_TIMEOUT_MS, windowsHide: true }
      );
      return parseConsoleHostOutput(stdout);
    } catch {
      return null;
    }
  }

  /**
   * Terminate every listed process that is still running *as the captured
   * image*, then wait until each has left the process table. Resolves once
   * all are gone or the per-process budget runs out; never throws.
   */
  async reap(processes: readonly SessionProcess[]): Promise<void> {
    await Promise.all(processes.map((target) => this.reapOne(target)));
  }

  private async reapOne(target: SessionProcess): Promise<void> {
    if (!isProcessAlive(target.pid)) return;
    const image = await this.imageOf(target.pid);
    // A different image means the PID was recycled after our process exited.
    if (image?.toLowerCase() !== target.image.toLowerCase()) return;
    try {
      process.kill(target.pid);
    } catch {
      // Exited between the check and the kill.
    }
    const deadline = Date.now() + PROCESS_EXIT_TIMEOUT_MS;
    while (isProcessAlive(target.pid) && Date.now() < deadline) {
      await sleep(PROCESS_EXIT_POLL_MS);
    }
  }

  private async imageOf(pid: number): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        { timeout: IMAGE_QUERY_TIMEOUT_MS, windowsHide: true }
      );
      return parseTasklistImage(stdout);
    } catch {
      return null;
    }
  }
}
