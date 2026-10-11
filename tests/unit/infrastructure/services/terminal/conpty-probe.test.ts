// TEMPORARY PROBE for #927 — removed before the PR leaves draft.
import { describe, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type * as NodePty from 'node-pty';

const requireCjs = createRequire(import.meta.url);

interface Proc {
  ProcessId: number;
  ParentProcessId: number;
  Name: string;
  CommandLine: string | null;
}

function allProcs(): Proc[] {
  const out = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out) as Proc[];
}

const HOST_PS = `Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class Cph {
  [DllImport("ntdll.dll")] public static extern int NtQueryInformationProcess(IntPtr h, int cls, out IntPtr info, int len, out int ret);
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  public static long Host(int pid){ IntPtr h=OpenProcess(0x1000,false,pid); if (h==IntPtr.Zero) return -1; IntPtr v; int r; int st=NtQueryInformationProcess(h,49,out v,IntPtr.Size,out r); return st==0 ? (v.ToInt64() & ~3L) : -(long)(uint)st; }
}
'@
`;

function hostPid(pid: number): string {
  const t = Date.now();
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `${HOST_PS}[Cph]::Host(${pid})`],
      {
        encoding: 'utf8',
      }
    );
    return `${out.trim()} (${Date.now() - t}ms)`;
  } catch (e) {
    return `err ${String(e).slice(0, 300)}`;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tryRm(dir: string): string {
  try {
    rmSync(dir, { recursive: true });
    return 'ok';
  } catch (e) {
    return (e as NodeJS.ErrnoException).code ?? String(e);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scenario(
  useConptyDll: boolean,
  waitReady: boolean
): Promise<Record<string, unknown>> {
  const pty = requireCjs('node-pty') as typeof NodePty;
  const dir = mkdtempSync(join(tmpdir(), 'shep-probe-'));
  const before = new Set(allProcs().map((p) => p.ProcessId));
  const term = pty.spawn(process.env.COMSPEC ?? 'cmd.exe', [], {
    cwd: dir,
    cols: 80,
    rows: 24,
    useConptyDll,
  });
  const log: unknown[] = [];
  const t0 = Date.now();
  let exited = -1;
  term.onExit(() => {
    exited = Date.now() - t0;
  });
  const shellPid = term.pid;
  const host = waitReady ? hostPid(shellPid) : 'skipped';
  if (waitReady) {
    await new Promise<void>((r) => {
      const d = term.onData(() => {
        d.dispose();
        r();
      });
      setTimeout(r, 10_000);
    });
  }
  const procs = allProcs();
  const fresh = procs.filter(
    (p) =>
      !before.has(p.ProcessId) && p.ParentProcessId === process.pid && p.Name !== 'powershell.exe'
  );
  log.push({
    shellPid,
    host,
    nodePid: process.pid,
    fresh: fresh.filter((p) => p.ParentProcessId === process.pid),
  });
  const killAt = Date.now();
  term.kill();
  for (let i = 0; i < 32; i++) {
    log.push({
      t: Date.now() - killAt,
      exitEventAt: exited < 0 ? null : exited - (killAt - t0),
      alive: fresh.map((p) => `${p.Name}:${p.ProcessId}:${alive(p.ProcessId)}`),
      rm: i % 4 === 0 ? tryRm(dir) : undefined,
    });
    if (fresh.every((p) => !alive(p.ProcessId)) && exited >= 0) {
      log.push({ final: tryRm(dir) });
      break;
    }
    await sleep(250);
  }
  const survivors = fresh.filter((p) => alive(p.ProcessId));
  for (const p of survivors) {
    try {
      process.kill(p.ProcessId);
    } catch {
      /* ignore */
    }
  }
  await sleep(500);
  log.push({ afterKillingSurvivors: tryRm(dir) });
  return { useConptyDll, waitReady, log };
}

async function immediate(): Promise<Record<string, unknown>> {
  const pty = requireCjs('node-pty') as typeof NodePty;
  const dir = mkdtempSync(join(tmpdir(), 'shep-probe-'));
  const before = new Set(allProcs().map((p) => p.ProcessId));
  const term = pty.spawn(process.env.COMSPEC ?? 'cmd.exe', [], { cwd: dir, cols: 80, rows: 24 });
  const shellPid = term.pid;
  const t0 = Date.now();
  let exitAt: number | null = null;
  term.onExit(() => {
    exitAt = Date.now() - t0;
  });
  term.kill();
  const log: unknown[] = [{ shellPid }];
  for (let i = 0; i < 6; i++) {
    const kids = allProcs().filter(
      (p) =>
        !before.has(p.ProcessId) && p.ParentProcessId === process.pid && p.Name !== 'powershell.exe'
    );
    log.push({
      t: Date.now() - t0,
      exitAt,
      shellAlive: alive(shellPid),
      kids: kids.map((k) => `${k.Name}:${k.ProcessId}`),
      rm: tryRm(dir),
    });
    if (kids.length === 0 && exitAt !== null) break;
    await sleep(1000);
  }
  return { immediate: true, log };
}

describe.runIf(process.platform === 'win32')('conpty probe', () => {
  it('records teardown', async () => {
    // Mirrors the #925 test: close straight after create, several times.
    for (let i = 0; i < 4; i++) {
      console.log(`PROBE ${JSON.stringify(await immediate())}`);
    }
    console.log(`PROBE ${JSON.stringify(await scenario(false, true))}`);
  }, 240_000);
});
