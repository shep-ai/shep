/**
 * Knowledge repositories (spec 125): migration 158, every field through both
 * column lists, one document per page and source, and visibility by space and
 * product line.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/158-create-knowledge.js';
import {
  SQLiteKnowledgeDocumentRepository,
  SQLiteKnowledgeSourceRepository,
} from '@/infrastructure/repositories/sqlite-knowledge.repository.js';
import {
  KnowledgeScopeKind,
  type KnowledgeDocument,
  type KnowledgeSource,
} from '@/domain/generated/output.js';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-02T11:00:00Z');

const SOURCE: KnowledgeSource = {
  id: 'src-1',
  connectionId: 'conn-notion',
  spaceId: 'space-acme',
  scopeId: 'page-root',
  scopeKind: KnowledgeScopeKind.Page,
  scopeTitle: 'Payments PRDs',
  intervalMinutes: 60,
  enabled: true,
  createdAt: T1,
  updatedAt: T1,
};

const FULL_SOURCE: KnowledgeSource = {
  ...SOURCE,
  productLineId: 'line-pay',
  lastRunAt: T2,
  lastRun: { added: 3, updated: 1, removed: 1, failed: 0 },
  lastError: 'rate limited',
  updatedAt: T2,
};

function doc(over: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
  return {
    id: 'doc-1',
    sourceId: SOURCE.id,
    spaceId: 'space-acme',
    pageId: 'page-1',
    title: 'Refunds',
    url: 'https://notion.so/refunds',
    content: '# Refunds\n\nGuests by email.',
    pageEditedAt: T1,
    createdAt: T1,
    updatedAt: T1,
    ...over,
  };
}

describe('SQLite knowledge repositories', () => {
  let db: Database.Database;
  let sources: SQLiteKnowledgeSourceRepository;
  let documents: SQLiteKnowledgeDocumentRepository;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    sources = new SQLiteKnowledgeSourceRepository(db);
    documents = new SQLiteKnowledgeDocumentRepository(db);
  });
  afterEach(() => db.close());

  it('migration 158 is idempotent', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });

  it('round-trips sources through create and update, clearing optional fields', async () => {
    await sources.create(SOURCE);
    expect(await sources.findById(SOURCE.id)).toEqual(SOURCE);
    await sources.update(FULL_SOURCE);
    expect(await sources.findById(SOURCE.id)).toEqual(FULL_SOURCE);
    await sources.update(SOURCE);
    expect(await sources.findById(SOURCE.id)).toEqual(SOURCE);

    await sources.create({ ...SOURCE, id: 'src-2', connectionId: 'other', createdAt: T2 });
    expect((await sources.list()).map((s) => s.id)).toEqual(['src-1', 'src-2']);
    expect((await sources.list('other')).map((s) => s.id)).toEqual(['src-2']);
    await sources.delete('src-2');
    expect(await sources.findById('src-2')).toBeNull();
  });

  it('round-trips documents and keeps one per page and source', async () => {
    await documents.create(doc({ productLineId: 'line-pay' }));
    expect(await documents.listBySource(SOURCE.id)).toEqual([doc({ productLineId: 'line-pay' })]);
    await documents.update(
      doc({ title: 'Refunds v2', content: 'new', pageEditedAt: T2, updatedAt: T2 })
    );
    expect((await documents.listBySource(SOURCE.id))[0]).toEqual(
      doc({ title: 'Refunds v2', content: 'new', pageEditedAt: T2, updatedAt: T2 })
    );
    await expect(documents.create(doc({ id: 'dup' }))).rejects.toThrow(/UNIQUE/);
  });

  it('shows a repository the space-wide documents and its own product line only', async () => {
    await documents.create(doc({ id: 'wide', pageId: 'p1', title: 'B wide' }));
    await documents.create(
      doc({ id: 'pay', pageId: 'p2', title: 'A pay', productLineId: 'line-pay' })
    );
    await documents.create(
      doc({ id: 'web', pageId: 'p3', title: 'C web', productLineId: 'line-web' })
    );
    await documents.create(doc({ id: 'other', pageId: 'p4', spaceId: 'space-home' }));

    expect((await documents.listVisible('space-acme')).map((d) => d.id)).toEqual(['wide']);
    expect((await documents.listVisible('space-acme', 'line-pay')).map((d) => d.id)).toEqual([
      'pay',
      'wide',
    ]);
    expect((await documents.listBySpace('space-acme')).map((d) => d.id)).toEqual([
      'pay',
      'wide',
      'web',
    ]);
  });

  it('deletes one document or all of a source', async () => {
    await documents.create(doc());
    await documents.create(doc({ id: 'doc-2', pageId: 'page-2' }));
    await documents.delete('doc-1');
    expect((await documents.listBySource(SOURCE.id)).map((d) => d.id)).toEqual(['doc-2']);
    await documents.deleteBySource(SOURCE.id);
    expect(await documents.listBySource(SOURCE.id)).toEqual([]);
  });
});
