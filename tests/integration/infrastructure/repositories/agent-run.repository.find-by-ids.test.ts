/**
 * Agent Run Repository — findByIds() integration tests
 *
 * Batch fetch added in spec 093 to kill the N+1 in
 * StreamAgentEventsUseCase + getGraphData(). One query for many ids,
 * chunked internally if the input exceeds the SQLite parameter limit.
 *
 * TDD Phase: RED
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteAgentRunRepository } from '@/infrastructure/repositories/agent-run.repository.js';
import type { AgentRun } from '@/domain/generated/output.js';
import { AgentType, AgentRunStatus } from '@/domain/generated/output.js';

describe('SQLiteAgentRunRepository.findByIds()', () => {
  let db: Database.Database;
  let repository: SQLiteAgentRunRepository;

  const createRun = (id: string, overrides?: Partial<AgentRun>): AgentRun => ({
    id,
    agentType: AgentType.ClaudeCode,
    agentName: 'analyze-repository',
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
    expect(tableExists(db, 'agent_runs')).toBe(true);
    repository = new SQLiteAgentRunRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns [] for empty input without touching the database', async () => {
    const result = await repository.findByIds([]);
    expect(result).toEqual([]);
  });

  it('returns runs matching the provided ids', async () => {
    await repository.create(createRun('run-001'));
    await repository.create(createRun('run-002'));
    await repository.create(createRun('run-003'));

    const result = await repository.findByIds(['run-001', 'run-003']);

    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(['run-001', 'run-003']);
  });

  it('silently drops ids that do not exist', async () => {
    await repository.create(createRun('run-001'));

    const result = await repository.findByIds(['run-001', 'run-missing']);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('run-001');
  });

  it('handles large input (>500 ids) without exceeding SQLite parameter limit', async () => {
    // Insert 50 real rows
    const realIds = Array.from({ length: 50 }, (_, i) => `run-${String(i).padStart(4, '0')}`);
    for (const id of realIds) {
      await repository.create(createRun(id));
    }

    // Query for 750 ids (50 real + 700 missing) — exceeds the conservative
    // 500-id chunk size used internally so we exercise the chunking path.
    const missingIds = Array.from({ length: 700 }, (_, i) => `missing-${i}`);
    const queryIds = [...realIds, ...missingIds];

    const result = await repository.findByIds(queryIds);

    expect(result).toHaveLength(50);
    const returnedIds = new Set(result.map((r) => r.id));
    for (const id of realIds) {
      expect(returnedIds.has(id)).toBe(true);
    }
  });
});
