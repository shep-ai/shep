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

async function scenario(useConptyDll: boolean): Promise<Record<string, unknown>> {
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
  await new Promise<void>((r) => {
    const d = term.onData(() => {
      d.dispose();
      r();
    });
    setTimeout(r, 10_000);
  });
  const procs = allProcs();
  const fresh = procs.filter((p) => !before.has(p.ProcessId));
  const shellPid = term.pid;
  log.push({ shellPid, nodePid: process.pid, fresh });
  const killAt = Date.now();
  term.kill();
  for (let i = 0; i < 40; i++) {
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
  return { useConptyDll, log };
}

describe.runIf(process.platform === 'win32')('conpty probe', () => {
  it('records teardown', async () => {
    for (const dll of [false, true]) {
      console.log(`PROBE ${JSON.stringify(await scenario(dll))}`);
    }
  }, 120_000);
});
