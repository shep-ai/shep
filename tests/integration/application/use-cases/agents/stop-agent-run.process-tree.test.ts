/**
 * Stop terminates the worker's whole process tree (spec 116 follow-up)
 *
 * Stop used to send one SIGTERM to the worker's pid. Two things survived it:
 *
 * - the agent CLI subprocesses the worker started — a worker that exits on
 *   SIGTERM left them running, orphaned, still holding the worktree and
 *   spending tokens;
 * - a worker that ignored SIGTERM — nothing ever escalated.
 *
 * These spawn REAL process trees shaped like a feature worker (a detached
 * parent that starts a non-detached child), because the defect only exists in
 * how signals reach real processes. Windows has no SIGTERM and is covered by
 * the adapter's unit tests (a single forced tree kill).
 */

import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StopAgentRunUseCase } from '@/application/use-cases/agents/stop-agent-run.use-case.js';
import { ProcessTreeTerminatorAdapter } from '@/infrastructure/services/process/process-tree-terminator.adapter.js';
import { ProcessLivenessAdapter } from '@/infrastructure/services/process/process-liveness.adapter.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { IPhaseTimingContext } from '@/application/ports/output/services/phase-timing-context.interface.js';
import type { AdmitQueuedFeaturesUseCase } from '@/application/use-cases/features/capacity/admit-queued-features.use-case.js';
import { AgentRunStatus, AgentType } from '@/domain/generated/output.js';
import { createFakeAgentRunRepository } from '../../../../helpers/agent-run-repository.fake.js';
import { removeDirWithRetry } from '../../../../helpers/remove-dir.helper.js';

const GRACE_MS = 300;
const WAIT_BUDGET_MS = 10_000;
const POLL_MS = 50;

/** A child that ignores SIGTERM, like an agent CLI blocked on an MCP server. */
const STUBBORN_CHILD = `process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`;

/**
 * A worker-shaped parent: starts the stubborn child in its own process group
 * (not detached — agent CLIs are not), records the child's pid, then idles.
 */
function workerScript(childPidFile: string, ignoreSigterm: boolean): string {
  return `
    const { spawn } = require('node:child_process');
    const { writeFileSync } = require('node:fs');
    ${ignoreSigterm ? "process.on('SIGTERM', () => {});" : ''}
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(STUBBORN_CHILD)}], { stdio: 'ignore' });
    writeFileSync(${JSON.stringify(childPidFile)}, String(child.pid));
    setInterval(() => {}, 1000);
  `;
}

/** Alive and not a zombie waiting for a reaper that may never come in a container. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (process.platform !== 'linux') return true;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // Field 3 is the state; it follows the parenthesised command name.
    return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z';
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean): Promise<boolean> {
  const deadline = Date.now() + WAIT_BUDGET_MS;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return predicate();
}

describe.skipIf(process.platform === 'win32')('StopAgentRunUseCase — process tree', () => {
  const spawned: number[] = [];
  let dir: string | undefined;

  afterEach(() => {
    for (const pid of spawned.splice(0)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone — the expected case.
      }
    }
    if (dir) removeDirWithRetry(dir);
    dir = undefined;
  });

  async function startWorker(ignoreSigterm: boolean): Promise<{ worker: number; child: number }> {
    dir = mkdtempSync(join(tmpdir(), 'shep-stop-tree-'));
    const childPidFile = join(dir, 'child.pid');
    const proc = spawn(process.execPath, ['-e', workerScript(childPidFile, ignoreSigterm)], {
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();
    const worker = proc.pid!;
    spawned.push(worker);
    expect(await waitFor(() => existsSync(childPidFile))).toBe(true);
    const child = Number(readFileSync(childPidFile, 'utf8'));
    spawned.push(child);
    return { worker, child };
  }

  function stopUseCase(pid: number): StopAgentRunUseCase {
    const now = new Date().toISOString();
    const repo = createFakeAgentRunRepository([
      {
        id: 'run-1',
        agentType: AgentType.ClaudeCode,
        agentName: 'feature-agent',
        status: AgentRunStatus.running,
        prompt: 'p',
        threadId: 't',
        pid,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const timingRepo = {} as IPhaseTimingRepository;
    const timingContext: IPhaseTimingContext = { recordLifecycleEvent: async () => undefined };
    return new StopAgentRunUseCase(
      repo as unknown as IAgentRunRepository,
      timingRepo,
      timingContext,
      new ProcessLivenessAdapter(),
      new ProcessTreeTerminatorAdapter({ graceMs: GRACE_MS }),
      { execute: async () => [] } as unknown as AdmitQueuedFeaturesUseCase,
      {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      }
    );
  }

  it('terminates the agent subprocesses a worker started, not just the worker', async () => {
    const { worker, child } = await startWorker(false);

    const result = await stopUseCase(worker).execute('run-1');

    expect(result.stopped).toBe(true);
    expect(await waitFor(() => !isRunning(worker))).toBe(true);
    expect(await waitFor(() => !isRunning(child))).toBe(true);
  });

  it('escalates to SIGKILL when the worker ignores SIGTERM', async () => {
    const { worker, child } = await startWorker(true);

    await stopUseCase(worker).execute('run-1');

    expect(await waitFor(() => !isRunning(worker))).toBe(true);
    expect(await waitFor(() => !isRunning(child))).toBe(true);
  });
});
