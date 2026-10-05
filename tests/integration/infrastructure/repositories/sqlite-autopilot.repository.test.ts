/** Autopilot (spec 132): migration 164 and every field through the repositories. */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/164-create-autopilot.js';
import {
  SQLiteAutopilotPolicyRepository,
  SQLiteAutopilotRunRepository,
} from '@/infrastructure/repositories/sqlite-autopilot.repository.js';
import type { AutopilotPolicy, AutopilotRun } from '@/domain/generated/output.js';

const T1 = new Date('2026-10-06T03:00:00Z');
const T2 = new Date('2026-10-06T04:00:00Z');

const POLICY: AutopilotPolicy = {
  spaceId: 'space-acme',
  investigateUrgent: true,
  fixConfident: true,
  mergeFixes: false,
  fillLine: true,
  projectId: 'project-pay',
  dailyFixBudget: 3,
  updatedAt: T1,
};

const RUN: AutopilotRun = {
  id: 'run-1',
  spaceId: 'space-acme',
  investigated: ['PAY-42'],
  fixed: ['PAY-41'],
  built: ['Dark mode'],
  errors: ['PAY-40: Pick the repository'],
  createdAt: T1,
  updatedAt: T1,
};

describe('SQLite autopilot repositories', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });
  afterEach(() => db.close());

  it('is idempotent', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });

  it('saves, replaces and lists policies', async () => {
    const policies = new SQLiteAutopilotPolicyRepository(db);
    await policies.save(POLICY);
    expect(await policies.find('space-acme')).toEqual(POLICY);
    const { projectId: _project, ...withoutProject } = POLICY;
    await policies.save({ ...withoutProject, fillLine: false, updatedAt: T2 });
    expect(await policies.find('space-acme')).toEqual({
      ...withoutProject,
      fillLine: false,
      updatedAt: T2,
    });
    expect(await policies.find('space-me')).toBeNull();
    expect((await policies.list()).map((p) => p.spaceId)).toEqual(['space-acme']);
  });

  it('records passes and lists a space newest first', async () => {
    const runs = new SQLiteAutopilotRunRepository(db);
    await runs.create(RUN);
    await runs.create({
      ...RUN,
      id: 'run-2',
      investigated: [],
      fixed: [],
      built: [],
      errors: [],
      createdAt: T2,
      updatedAt: T2,
    });
    await runs.create({ ...RUN, id: 'run-3', spaceId: 'space-me' });
    const listed = await runs.listBySpace('space-acme');
    expect(listed.map((r) => r.id)).toEqual(['run-2', 'run-1']);
    expect(listed[1]).toEqual(RUN);
    expect((await runs.listBySpace('space-acme', 1)).map((r) => r.id)).toEqual(['run-2']);
  });
});
