/**
 * Agent Run Repository — findLatestByFeatureId() integration tests (spec 101).
 *
 * Resolves the run a WhatsApp HITL reply (approve/reject) should act on.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteAgentRunRepository } from '@/infrastructure/repositories/agent-run.repository.js';
import type { AgentRun } from '@/domain/generated/output.js';
import { AgentType, AgentRunStatus } from '@/domain/generated/output.js';

describe('SQLiteAgentRunRepository.findLatestByFeatureId()', () => {
  let db: Database.Database;
  let repository: SQLiteAgentRunRepository;

  const createRun = (id: string, overrides?: Partial<AgentRun>): AgentRun => ({
    id,
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.pending,
    prompt: 'prompt',
    threadId: `thread-${id}`,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repository = new SQLiteAgentRunRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns null when the feature has no runs', async () => {
    expect(await repository.findLatestByFeatureId('feat-none')).toBeNull();
  });

  it('returns the most recently created run for the feature', async () => {
    await repository.create(
      createRun('run-old', { featureId: 'feat-1', createdAt: new Date('2025-01-01T00:00:00Z') })
    );
    await repository.create(
      createRun('run-new', { featureId: 'feat-1', createdAt: new Date('2025-02-01T00:00:00Z') })
    );
    await repository.create(
      createRun('run-other', { featureId: 'feat-2', createdAt: new Date('2025-03-01T00:00:00Z') })
    );

    const latest = await repository.findLatestByFeatureId('feat-1');
    expect(latest?.id).toBe('run-new');
  });
});
