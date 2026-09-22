/**
 * Agent Run Repository — `expectedUpdatedAt` guard (spec 116 follow-up)
 *
 * The liveness sweep judges a run from a read ("no heartbeat for 5 minutes")
 * and then writes `failed`. A laptop that slept is the real trigger for the
 * race: on wake the worker's overdue heartbeat and the sweep fire together, and
 * a status-only guard (`allowedFrom: [running]`) still lets the sweep fail a
 * worker whose heartbeat has just landed. Conditioning the write on the row
 * being exactly the one that was judged puts the read in the same statement.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteAgentRunRepository } from '@/infrastructure/repositories/agent-run.repository.js';
import { AgentRunStatus, AgentType } from '@/domain/generated/output.js';

const JUDGED_AT = new Date('2026-01-01T00:00:00Z');
const HEARTBEAT_AT = new Date('2026-01-01T00:05:00Z');
const SWEPT_AT = new Date('2026-01-01T00:06:00Z');

describe('SQLiteAgentRunRepository.updateStatus — expectedUpdatedAt', () => {
  let db: Database.Database;
  let repository: SQLiteAgentRunRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repository = new SQLiteAgentRunRepository(db);
    await repository.create({
      id: 'run-1',
      agentType: AgentType.ClaudeCode,
      agentName: 'feature-agent',
      status: AgentRunStatus.running,
      prompt: 'p',
      threadId: 't',
      pid: 4242,
      createdAt: JUDGED_AT,
      updatedAt: JUDGED_AT,
    });
  });

  afterEach(() => {
    db.close();
  });

  const sweep = () =>
    repository.updateStatus(
      'run-1',
      AgentRunStatus.failed,
      { error: 'stopped responding', updatedAt: SWEPT_AT },
      { allowedFrom: [AgentRunStatus.running], expectedUpdatedAt: JUDGED_AT }
    );

  it('applies the write while the row is still the one that was judged', async () => {
    expect(await sweep()).toBe(true);
    expect((await repository.findById('run-1'))?.status).toBe(AgentRunStatus.failed);
  });

  it('refuses the write once a heartbeat has touched the row since', async () => {
    await repository.updateStatus(
      'run-1',
      AgentRunStatus.running,
      { lastHeartbeat: HEARTBEAT_AT, updatedAt: HEARTBEAT_AT },
      { allowedFrom: [AgentRunStatus.running] }
    );

    expect(await sweep()).toBe(false);
    expect((await repository.findById('run-1'))?.status).toBe(AgentRunStatus.running);
  });
});
