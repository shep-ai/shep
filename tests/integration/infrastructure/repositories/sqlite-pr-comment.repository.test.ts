/**
 * PR comment repositories (spec 124): migration 156, every field through both
 * the insert and update column lists, ordering, and one row per GitHub comment.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/156-create-pr-comments.js';
import {
  SQLitePrCommentRepository,
  SQLitePrCommentRoundRepository,
} from '@/infrastructure/repositories/sqlite-pr-comment.repository.js';
import {
  AgentType,
  PrCommentKind,
  PrCommentRoundStatus,
  PrCommentStatus,
  type PrComment,
  type PrCommentRound,
} from '@/domain/generated/output.js';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-02T11:00:00Z');

const MINIMAL: PrComment = {
  id: 'c1',
  featureId: 'f1',
  githubId: '101',
  kind: PrCommentKind.Conversation,
  author: 'ada',
  body: 'Looks good, one question',
  url: 'https://github.com/o/r/pull/7#issuecomment-101',
  writtenAt: T1,
  status: PrCommentStatus.Pending,
  createdAt: T1,
  updatedAt: T1,
};

const FULL: PrComment = {
  ...MINIMAL,
  id: 'c2',
  githubId: '202',
  kind: PrCommentKind.Inline,
  path: 'src/a.ts',
  line: 42,
  diffHunk: '@@ -1 +1 @@\n-a\n+b',
  threadId: 'PRRT_abc',
  status: PrCommentStatus.Addressed,
  reply: 'Renamed.',
  replyUrl: 'https://github.com/o/r/pull/7#discussion_r303',
  roundId: 'r1',
  error: 'earlier failure',
  updatedAt: T2,
};

const ROUND: PrCommentRound = {
  id: 'r1',
  featureId: 'f1',
  commentIds: ['c1', 'c2'],
  status: PrCommentRoundStatus.Completed,
  agentType: AgentType.ClaudeCode,
  commitSha: 'c0ffee',
  summary: 'Renamed and answered',
  error: 'none',
  finishedAt: T2,
  createdAt: T1,
  updatedAt: T2,
};

describe('SQLite PR comment repositories', () => {
  let db: Database.Database;
  let comments: SQLitePrCommentRepository;
  let rounds: SQLitePrCommentRoundRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    comments = new SQLitePrCommentRepository(db);
    rounds = new SQLitePrCommentRoundRepository(db);
  });

  afterEach(() => db.close());

  it('migration 156 is idempotent', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });

  it('round-trips comments through create and update, and clears optional fields', async () => {
    await comments.create(MINIMAL);
    await comments.create(FULL);
    expect(await comments.findByGithubId('f1', PrCommentKind.Inline, '202')).toEqual(FULL);
    expect(await comments.findByGithubId('f1', PrCommentKind.Conversation, '101')).toEqual(MINIMAL);

    await comments.update({ ...FULL, id: 'c1', kind: MINIMAL.kind, githubId: MINIMAL.githubId });
    expect(await comments.findByGithubId('f1', PrCommentKind.Conversation, '101')).toEqual({
      ...FULL,
      id: 'c1',
      kind: MINIMAL.kind,
      githubId: MINIMAL.githubId,
    });
    await comments.update({ ...MINIMAL });
    expect(await comments.findByGithubId('f1', PrCommentKind.Conversation, '101')).toEqual(MINIMAL);
  });

  it('keeps one row per GitHub comment and kind', async () => {
    await comments.create(MINIMAL);
    await expect(comments.create({ ...MINIMAL, id: 'dup' })).rejects.toThrow(/UNIQUE/);
    await comments.create({ ...MINIMAL, id: 'other-kind', kind: PrCommentKind.Review });
    expect(await comments.findByGithubId('f1', PrCommentKind.Inline, '101')).toBeNull();
  });

  it('lists a feature comments oldest first', async () => {
    await comments.create({ ...MINIMAL, id: 'late', githubId: '2', writtenAt: T2 });
    await comments.create(MINIMAL);
    await comments.create({ ...MINIMAL, id: 'elsewhere', githubId: '3', featureId: 'f2' });
    expect((await comments.listByFeature('f1')).map((c) => c.id)).toEqual(['c1', 'late']);
  });

  it('round-trips rounds and lists them newest first', async () => {
    await rounds.create({
      id: 'r0',
      featureId: 'f1',
      commentIds: [],
      status: PrCommentRoundStatus.Running,
      createdAt: T1,
      updatedAt: T1,
    });
    await rounds.create({ ...ROUND, createdAt: T2 });
    expect(await rounds.findById('r1')).toEqual({ ...ROUND, createdAt: T2 });
    expect((await rounds.listByFeature('f1')).map((r) => r.id)).toEqual(['r1', 'r0']);

    await rounds.update({ ...ROUND, id: 'r0', createdAt: T1 });
    expect(await rounds.findById('r0')).toEqual({ ...ROUND, id: 'r0', createdAt: T1 });
    expect(await rounds.findById('missing')).toBeNull();
  });
});
