/**
 * SQLiteWorkflowStepRepository — guarded status writes.
 *
 * A step's `pending → running` transition is the claim that lets exactly one
 * walker (creation's orchestrator or a resume) send that step's prompt; the
 * write must refuse once another writer has moved the row.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteWorkflowStepRepository } from '@/infrastructure/repositories/sqlite-workflow-step.repository.js';
import { WorkflowStepStatus, type WorkflowStep } from '@/domain/generated/output.js';

describe('SQLiteWorkflowStepRepository.updateStatus guard', () => {
  let db: Database.Database;
  let repo: SQLiteWorkflowStepRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    // The session row is irrelevant to the guard; skip the FK.
    db.pragma('foreign_keys = OFF');
    repo = new SQLiteWorkflowStepRepository(db);
    const now = new Date();
    await repo.create({
      id: 'step-1',
      sessionId: 'session-1',
      featureId: 'app-feat',
      workflowId: 'wf',
      stepKey: 'one',
      stepIndex: 0,
      title: 'One',
      description: '',
      status: WorkflowStepStatus.pending,
      createdAt: now,
      updatedAt: now,
    } as WorkflowStep);
  });

  afterEach(() => db.close());

  it('writes and returns true while the step is in an allowed status', async () => {
    const claimed = await repo.updateStatus('step-1', WorkflowStepStatus.running, undefined, {
      allowedFrom: [WorkflowStepStatus.pending],
    });

    expect(claimed).toBe(true);
    expect((await repo.findById('step-1'))!.status).toBe(WorkflowStepStatus.running);
  });

  it('lets exactly one of two racing claims win', async () => {
    const claim = () =>
      repo.updateStatus('step-1', WorkflowStepStatus.running, undefined, {
        allowedFrom: [WorkflowStepStatus.pending],
      });

    const results = await Promise.all([claim(), claim()]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('refuses, and leaves the row alone, once the step left the allowed statuses', async () => {
    await repo.updateStatus('step-1', WorkflowStepStatus.running);

    const reset = await repo.updateStatus('step-1', WorkflowStepStatus.pending, undefined, {
      allowedFrom: [WorkflowStepStatus.failed, WorkflowStepStatus.interrupted],
    });

    expect(reset).toBe(false);
    expect((await repo.findById('step-1'))!.status).toBe(WorkflowStepStatus.running);
  });

  it('still writes unconditionally without a guard', async () => {
    await expect(repo.updateStatus('step-1', WorkflowStepStatus.done)).resolves.toBe(true);
  });
});
