/**
 * SQLiteArchivedSessionRepository Integration Tests
 *
 * Covers migration 141 and the marker-table semantics that make session
 * archiving reversible (spec 106): archive inserts, unarchive deletes, both
 * idempotent, and no provider file is involved at any point.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase, tableExists } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteArchivedSessionRepository } from '@/infrastructure/repositories/sqlite-archived-session.repository.js';

const CLAUDE = 'claude-code';
const CURSOR = 'cursor';

describe('archived_agent_sessions (migration 141)', () => {
  let db: Database.Database;
  let repo: SQLiteArchivedSessionRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteArchivedSessionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates the archived_agent_sessions table', () => {
    expect(tableExists(db, 'archived_agent_sessions')).toBe(true);
  });

  it('has a composite primary key on (agent_type, session_id)', () => {
    const columns = db.prepare('PRAGMA table_info(archived_agent_sessions)').all() as {
      name: string;
      pk: number;
    }[];
    const pkColumns = columns.filter((c) => c.pk > 0).map((c) => c.name);

    expect(pkColumns.sort()).toEqual(['agent_type', 'session_id']);
  });

  it('is idempotent when migrations run again', async () => {
    await expect(runSQLiteMigrations(db)).resolves.not.toThrow();
    expect(tableExists(db, 'archived_agent_sessions')).toBe(true);
  });

  describe('archive / unarchive', () => {
    it('marks a session as archived', async () => {
      await repo.archive({ agentType: CLAUDE, sessionId: 's1' });

      expect(await repo.isArchived({ agentType: CLAUDE, sessionId: 's1' })).toBe(true);
    });

    it('reports an un-archived session as not archived', async () => {
      expect(await repo.isArchived({ agentType: CLAUDE, sessionId: 'never' })).toBe(false);
    });

    it('removes the marker on unarchive', async () => {
      await repo.archive({ agentType: CLAUDE, sessionId: 's1' });
      await repo.unarchive({ agentType: CLAUDE, sessionId: 's1' });

      expect(await repo.isArchived({ agentType: CLAUDE, sessionId: 's1' })).toBe(false);
    });

    it('is idempotent when archiving twice', async () => {
      await repo.archive({ agentType: CLAUDE, sessionId: 's1' });
      await expect(repo.archive({ agentType: CLAUDE, sessionId: 's1' })).resolves.not.toThrow();

      const count = db
        .prepare('SELECT COUNT(*) AS n FROM archived_agent_sessions WHERE session_id = ?')
        .get('s1') as { n: number };
      expect(count.n).toBe(1);
    });

    it('is idempotent when unarchiving a session that was never archived', async () => {
      await expect(
        repo.unarchive({ agentType: CLAUDE, sessionId: 'ghost' })
      ).resolves.not.toThrow();
    });

    it('scopes markers per provider — same id under two agents is two sessions', async () => {
      await repo.archive({ agentType: CLAUDE, sessionId: 'shared-id' });

      expect(await repo.isArchived({ agentType: CLAUDE, sessionId: 'shared-id' })).toBe(true);
      expect(await repo.isArchived({ agentType: CURSOR, sessionId: 'shared-id' })).toBe(false);
    });
  });

  describe('bulk queries used by the session tree', () => {
    it('returns archived ids for one provider as a set', async () => {
      await repo.archive({ agentType: CLAUDE, sessionId: 'a' });
      await repo.archive({ agentType: CLAUDE, sessionId: 'b' });
      await repo.archive({ agentType: CURSOR, sessionId: 'c' });

      const claudeIds = await repo.listArchivedIds(CLAUDE);

      expect(claudeIds).toBeInstanceOf(Set);
      expect([...claudeIds].sort()).toEqual(['a', 'b']);
    });

    it('returns an empty set for a provider with nothing archived', async () => {
      expect((await repo.listArchivedIds(CURSOR)).size).toBe(0);
    });

    it('groups archived ids by agent type across providers', async () => {
      await repo.archive({ agentType: CLAUDE, sessionId: 'a' });
      await repo.archive({ agentType: CURSOR, sessionId: 'c' });

      const all = await repo.listAllArchivedIds();

      expect(all.get(CLAUDE)).toEqual(new Set(['a']));
      expect(all.get(CURSOR)).toEqual(new Set(['c']));
    });

    it('returns an empty map when nothing is archived', async () => {
      expect((await repo.listAllArchivedIds()).size).toBe(0);
    });
  });
});
