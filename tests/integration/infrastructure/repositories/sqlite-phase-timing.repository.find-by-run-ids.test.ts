/**
 * Phase Timing Repository — findByRunIds() integration tests
 *
 * Batch fetch added in spec 093 to kill the N+1 in
 * StreamAgentEventsUseCase. One query for many run ids, chunked
 * internally if the input exceeds the SQLite parameter limit.
 *
 * TDD Phase: RED
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLitePhaseTimingRepository } from '@/infrastructure/repositories/sqlite-phase-timing.repository.js';
import type { PhaseTiming } from '@/domain/generated/output.js';

describe('SQLitePhaseTimingRepository.findByRunIds()', () => {
  let db: Database.Database;
  let repository: SQLitePhaseTimingRepository;

  const createTiming = (id: string, runId: string, phase: string): PhaseTiming => ({
    id,
    agentRunId: runId,
    phase,
    startedAt: new Date('2025-01-01T00:00:00Z'),
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  });

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'phase_timings')).toBe(true);
    repository = new SQLitePhaseTimingRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns [] for empty input without touching the database', async () => {
    const result = await repository.findByRunIds([]);
    expect(result).toEqual([]);
  });

  it('returns timings whose agent_run_id matches any of the provided ids', async () => {
    await repository.save(createTiming('t-1', 'run-A', 'requirements'));
    await repository.save(createTiming('t-2', 'run-A', 'plan'));
    await repository.save(createTiming('t-3', 'run-B', 'requirements'));
    await repository.save(createTiming('t-4', 'run-C', 'requirements'));

    const result = await repository.findByRunIds(['run-A', 'run-B']);

    const ids = result.map((t) => t.id).sort();
    expect(ids).toEqual(['t-1', 't-2', 't-3']);
  });

  it('groups correctly by agent_run_id (callers can build a Map)', async () => {
    await repository.save(createTiming('t-1', 'run-A', 'requirements'));
    await repository.save(createTiming('t-2', 'run-A', 'plan'));
    await repository.save(createTiming('t-3', 'run-B', 'requirements'));

    const result = await repository.findByRunIds(['run-A', 'run-B']);

    const grouped = new Map<string, PhaseTiming[]>();
    for (const t of result) {
      const list = grouped.get(t.agentRunId) ?? [];
      list.push(t);
      grouped.set(t.agentRunId, list);
    }

    expect(grouped.get('run-A')).toHaveLength(2);
    expect(grouped.get('run-B')).toHaveLength(1);
  });

  it('silently drops run ids that do not exist', async () => {
    await repository.save(createTiming('t-1', 'run-A', 'requirements'));

    const result = await repository.findByRunIds(['run-A', 'run-missing']);

    expect(result).toHaveLength(1);
    expect(result[0]!.agentRunId).toBe('run-A');
  });

  it('handles large input (>500 ids) without exceeding SQLite parameter limit', async () => {
    const realRunIds = Array.from({ length: 30 }, (_, i) => `run-${String(i).padStart(4, '0')}`);
    let timingCounter = 0;
    for (const runId of realRunIds) {
      await repository.save(createTiming(`t-${timingCounter++}`, runId, 'requirements'));
    }

    const missingRunIds = Array.from({ length: 700 }, (_, i) => `missing-${i}`);
    const queryIds = [...realRunIds, ...missingRunIds];

    const result = await repository.findByRunIds(queryIds);

    expect(result).toHaveLength(30);
  });
});
