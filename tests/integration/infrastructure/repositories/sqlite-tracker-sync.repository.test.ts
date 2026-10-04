/**
 * Tracker sync repositories (spec 122): migration 154 tables, every field
 * round-tripped twice (insert and update column lists), and the connection
 * secret stored encrypted and returned only by getSecret.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/154-create-tracker-sync.js';
import { LocalSecretBox } from '@/infrastructure/services/crypto/local-secret-box.js';
import { SQLiteTrackerConnectionRepository } from '@/infrastructure/repositories/sqlite-tracker-connection.repository.js';
import { SQLiteTrackerSyncRuleRepository } from '@/infrastructure/repositories/sqlite-tracker-sync-rule.repository.js';
import { SQLiteTrackerIssueLinkRepository } from '@/infrastructure/repositories/sqlite-tracker-issue-link.repository.js';
import {
  Priority,
  StateGroup,
  TrackerConnectionStatus,
  TrackerProvider,
  TrackerSyncDirection,
  type TrackerConnection,
  type TrackerIssueLink,
  type TrackerSyncRule,
} from '@/domain/generated/output.js';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-02T11:00:00Z');

const JIRA: TrackerConnection = {
  id: 'conn-jira',
  provider: TrackerProvider.Jira,
  name: 'Acme Jira',
  slug: 'acme-jira',
  spaceId: 'space-acme',
  siteUrl: 'https://acme.atlassian.net',
  accountEmail: 'me@acme.com',
  accountName: 'Me',
  status: TrackerConnectionStatus.Connected,
  lastCheckedAt: T1,
  createdAt: T1,
  updatedAt: T1,
};

const RULE: TrackerSyncRule = {
  id: 'rule-1',
  connectionId: JIRA.id,
  projectId: 'project-pay',
  scope: 'project = PAY',
  direction: TrackerSyncDirection.TwoWay,
  intervalMinutes: 15,
  enabled: true,
  cursor: T1,
  lastRunAt: T1,
  lastRun: { created: 3, updated: 1, pushed: 2, conflicts: 1, failed: 0, rateLimited: false },
  createdAt: T1,
  updatedAt: T1,
};

const LINK: TrackerIssueLink = {
  workItemId: 'wi-1',
  ruleId: RULE.id,
  connectionId: JIRA.id,
  externalId: '10042',
  externalKey: 'PAY-42',
  externalUrl: 'https://acme.atlassian.net/browse/PAY-42',
  syncedTitle: 'Fix refunds',
  syncedDescription: 'Steps',
  syncedStateGroup: StateGroup.Started,
  syncedPriority: Priority.High,
  remoteUpdatedAt: T1,
  createdAt: T1,
  updatedAt: T1,
};

describe('tracker sync repositories', () => {
  let db: Database.Database;
  let connections: SQLiteTrackerConnectionRepository;
  let rules: SQLiteTrackerSyncRuleRepository;
  let links: SQLiteTrackerIssueLinkRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    connections = new SQLiteTrackerConnectionRepository(db, new LocalSecretBox(randomBytes(32)));
    rules = new SQLiteTrackerSyncRuleRepository(db);
    links = new SQLiteTrackerIssueLinkRepository(db);
  });

  afterEach(() => db.close());

  it('re-running migration 154 is a no-op', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });

  describe('connections', () => {
    it('round-trips every field and keeps the secret encrypted', async () => {
      await connections.create(JIRA, 'jira-api-token-123');
      expect(await connections.findById(JIRA.id)).toEqual(JIRA);
      expect(await connections.findBySlug('acme-jira')).toEqual(JIRA);
      expect(await connections.getSecret(JIRA.id)).toBe('jira-api-token-123');

      const raw = db.prepare('SELECT * FROM tracker_connections').get() as Record<string, unknown>;
      expect(JSON.stringify(raw)).not.toContain('jira-api-token-123');

      const changed: TrackerConnection = {
        ...JIRA,
        name: 'Acme Jira Cloud',
        status: TrackerConnectionStatus.Error,
        lastError: 'HTTP 401',
        lastCheckedAt: T2,
        updatedAt: T2,
      };
      await connections.update(changed);
      expect(await connections.list()).toEqual([changed]);
      expect(await connections.getSecret(JIRA.id)).toBe('jira-api-token-123');
    });

    it('stores a Linear connection without site or email', async () => {
      const linear: TrackerConnection = {
        ...JIRA,
        id: 'conn-linear',
        provider: TrackerProvider.Linear,
        slug: 'acme-linear',
        siteUrl: undefined,
        accountEmail: undefined,
      };
      const { siteUrl: _s, accountEmail: _e, ...expected } = linear;
      await connections.create(linear, 'lin_api_x');
      expect(await connections.findById('conn-linear')).toEqual(expected);
    });

    it('deletes a connection and returns no secret afterwards', async () => {
      await connections.create(JIRA, 'secret');
      await connections.delete(JIRA.id);
      expect(await connections.findById(JIRA.id)).toBeNull();
      expect(await connections.getSecret(JIRA.id)).toBeNull();
    });
  });

  describe('rules', () => {
    it('round-trips every field through create and update, and lists by connection', async () => {
      await rules.create(RULE);
      expect(await rules.findById(RULE.id)).toEqual(RULE);

      const changed: TrackerSyncRule = {
        ...RULE,
        scope: 'project = PAY AND type = Bug',
        direction: TrackerSyncDirection.Import,
        intervalMinutes: 60,
        enabled: false,
        cursor: T2,
        lastRunAt: T2,
        lastRun: { created: 0, updated: 0, pushed: 0, conflicts: 0, failed: 2, rateLimited: true },
        lastError: 'HTTP 429',
        updatedAt: T2,
      };
      await rules.update(changed);
      expect(await rules.list(JIRA.id)).toEqual([changed]);
      expect(await rules.list('other')).toEqual([]);

      await rules.deleteByConnection(JIRA.id);
      expect(await rules.list()).toEqual([]);
    });

    it('stores a rule that never ran', async () => {
      const { cursor: _c, lastRunAt: _l, lastRun: _r, ...fresh } = RULE;
      await rules.create(fresh);
      expect(await rules.findById(RULE.id)).toEqual(fresh);
    });
  });

  describe('issue links', () => {
    it('upserts by work item and finds by external id', async () => {
      await links.upsert(LINK);
      expect(await links.findByExternalId(JIRA.id, '10042')).toEqual(LINK);
      expect(await links.findByWorkItemId('wi-1')).toEqual(LINK);

      const changed: TrackerIssueLink = {
        ...LINK,
        syncedTitle: 'Fix partial refunds',
        syncedDescription: undefined,
        syncedStateGroup: StateGroup.Completed,
        syncedPriority: Priority.Urgent,
        remoteUpdatedAt: T2,
        updatedAt: T2,
      };
      await links.upsert(changed);
      const { syncedDescription: _d, ...expected } = changed;
      expect(await links.listByRule(RULE.id)).toEqual([expected]);
    });

    it('deletes links by rule and by connection', async () => {
      await links.upsert(LINK);
      await links.upsert({ ...LINK, workItemId: 'wi-2', externalId: '10043', ruleId: 'rule-2' });
      await links.deleteByRule(RULE.id);
      expect(await links.findByWorkItemId('wi-1')).toBeNull();
      await links.deleteByConnection(JIRA.id);
      expect(await links.findByWorkItemId('wi-2')).toBeNull();
    });
  });
});
