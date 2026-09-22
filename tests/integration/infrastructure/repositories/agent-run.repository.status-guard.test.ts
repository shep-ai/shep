/**
 * Guarded Status Transition Integration Tests
 *
 * `updateStatus` was `UPDATE agent_runs SET ... WHERE id = @id` with no status
 * condition and no `.changes` check, so the daemon's crash sweep could
 * overwrite a run the worker had just completed — and the caller could not
 * even tell that it had.
 *
 * Two connections against one database file, because the losing write and the
 * winning write come from different processes.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { createFileDatabase } from '../../../helpers/database.helper.js';
import { removeDirWithRetry } from '../../../helpers/remove-dir.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteAgentRunRepository } from '@/infrastructure/repositories/agent-run.repository.js';
import { AgentRunStatus, AgentType } from '@/domain/generated/output.js';
import {
  claimRunForWorker,
  finishRun,
} from '@/infrastructure/services/agents/feature-agent/worker-run-status.js';
import { claimRunForResume } from '@/application/use-cases/agents/resume-run-claim.js';
import type { AgentRun } from '@/domain/generated/output.js';

const RUN_ID = 'run-1';

/** Everything a run may be in while it is still the sweep's business. */
const NON_TERMINAL: AgentRunStatus[] = [
  AgentRunStatus.pending,
  AgentRunStatus.running,
  AgentRunStatus.waitingApproval,
];

function makeRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: RUN_ID,
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.running,
    prompt: 'do the thing',
    threadId: 'thread-1',
    pid: 4242,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('SQLiteAgentRunRepository.updateStatus — state guard', () => {
  let dir: string;
  let workerDb: Database.Database;
  let daemonDb: Database.Database;
  let worker: SQLiteAgentRunRepository;
  let daemon: SQLiteAgentRunRepository;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'shep-run-guard-'));
    const dbPath = join(dir, 'data');
    workerDb = createFileDatabase(dbPath);
    await runSQLiteMigrations(workerDb);
    daemonDb = createFileDatabase(dbPath);
    worker = new SQLiteAgentRunRepository(workerDb);
    daemon = new SQLiteAgentRunRepository(daemonDb);
    await worker.create(makeRun());
  });

  afterEach(() => {
    workerDb.close();
    daemonDb.close();
    removeDirWithRetry(dir);
  });

  it('does not overwrite a run the worker completed in the meantime', async () => {
    const completedAt = new Date('2026-01-01T01:00:00Z');
    await worker.updateStatus(RUN_ID, AgentRunStatus.completed, {
      completedAt,
      result: 'all good',
    });

    const wrote = await daemon.updateStatus(
      RUN_ID,
      AgentRunStatus.interrupted,
      { error: 'Agent process (PID 4242) crashed or was killed', completedAt: new Date() },
      { allowedFrom: NON_TERMINAL }
    );

    expect(wrote).toBe(false);
    const run = await daemon.findById(RUN_ID);
    expect(run?.status).toBe(AgentRunStatus.completed);
    expect(run?.result).toBe('all good');
    expect(run?.error).toBeUndefined();
    expect(run?.completedAt?.getTime()).toBe(completedAt.getTime());
  });

  it('applies the transition while the run is still non-terminal', async () => {
    const wrote = await daemon.updateStatus(
      RUN_ID,
      AgentRunStatus.interrupted,
      { error: 'crashed' },
      { allowedFrom: NON_TERMINAL }
    );

    expect(wrote).toBe(true);
    expect((await daemon.findById(RUN_ID))?.status).toBe(AgentRunStatus.interrupted);
  });

  it('lets exactly one of two racing guarded writes through', async () => {
    const results = await Promise.all([
      worker.updateStatus(RUN_ID, AgentRunStatus.completed, {}, { allowedFrom: NON_TERMINAL }),
      daemon.updateStatus(RUN_ID, AgentRunStatus.interrupted, {}, { allowedFrom: NON_TERMINAL }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('reports false for a run that does not exist', async () => {
    expect(await daemon.updateStatus('missing', AgentRunStatus.failed)).toBe(false);
  });

  it('stays unguarded by default, so resuming an interrupted run still works', async () => {
    await worker.updateStatus(RUN_ID, AgentRunStatus.interrupted, { error: 'stopped' });

    // ResumeFeatureUseCase restarts interrupted runs and the worker then writes
    // `running`. A blanket terminal guard would silently refuse that write and
    // leave a live agent reported as crashed.
    const wrote = await worker.updateStatus(RUN_ID, AgentRunStatus.running, {
      pid: 5151,
    });

    expect(wrote).toBe(true);
    expect((await daemon.findById(RUN_ID))?.status).toBe(AgentRunStatus.running);
  });

  it('clears the pid in the same statement when the update passes pid: null', async () => {
    const wrote = await daemon.updateStatus(RUN_ID, AgentRunStatus.running, { pid: null });

    expect(wrote).toBe(true);
    expect((await worker.findById(RUN_ID))?.pid).toBeUndefined();
  });

  describe('worker ownership (spec 116)', () => {
    it('refuses the worker boot claim once Stop marked the run interrupted', async () => {
      await worker.updateStatus(RUN_ID, AgentRunStatus.pending, { pid: null });
      await daemon.updateStatus(RUN_ID, AgentRunStatus.interrupted, { error: 'Stopped by user' });

      const claimed = await claimRunForWorker(worker, RUN_ID, 7777, new Date());

      expect(claimed).toBe(false);
      const run = await daemon.findById(RUN_ID);
      expect(run?.status).toBe(AgentRunStatus.interrupted);
      expect(run?.pid).toBeUndefined();
    });

    it('does not let a completed write overwrite a Stop', async () => {
      await daemon.updateStatus(RUN_ID, AgentRunStatus.interrupted, { error: 'Stopped by user' });

      const wrote = await finishRun(worker, RUN_ID, AgentRunStatus.completed, {
        completedAt: new Date(),
      });

      expect(wrote).toBe(false);
      expect((await daemon.findById(RUN_ID))?.status).toBe(AgentRunStatus.interrupted);
    });

    it('lets exactly one of two racing resume claims win and clears the old pid', async () => {
      await worker.updateStatus(RUN_ID, AgentRunStatus.waitingApproval);

      const results = await Promise.all([
        claimRunForResume(worker, RUN_ID, new Date()),
        claimRunForResume(daemon, RUN_ID, new Date()),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      const run = await daemon.findById(RUN_ID);
      expect(run?.status).toBe(AgentRunStatus.running);
      expect(run?.pid).toBeUndefined();
    });
  });
});
