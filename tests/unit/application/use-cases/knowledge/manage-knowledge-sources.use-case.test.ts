import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageKnowledgeSourcesUseCase } from '@/application/use-cases/knowledge/manage-knowledge-sources.use-case.js';
import { DEFAULT_KNOWLEDGE_INTERVAL_MINUTES } from '@/domain/shared/knowledge.js';
import { ConnectionRequestError } from '@/application/ports/output/services/connection-errors.js';
import { KnowledgeScopeKind } from '@/domain/generated/output.js';
import type { IProductLineRepository } from '@/application/ports/output/repositories/product-line-repository.interface.js';
import { InMemoryConnections } from '../../../../helpers/tracker-repositories.mock.js';
import {
  InMemoryKnowledgeDocuments,
  InMemoryKnowledgeSources,
} from '../../../../helpers/knowledge-repositories.mock.js';
import { FakeKnowledgeClient, LINEAR, NOTION, T0, fakeFactory } from './knowledge.fixtures.js';

const LINES = [
  { id: 'line-pay', slug: 'pay', name: 'Payments', spaceId: 'space-acme' },
  { id: 'line-home', slug: 'garden', name: 'Garden', spaceId: 'space-home' },
];

describe('ManageKnowledgeSourcesUseCase', () => {
  let connections: InMemoryConnections;
  let sources: InMemoryKnowledgeSources;
  let documents: InMemoryKnowledgeDocuments;
  let client: FakeKnowledgeClient;
  let useCase: ManageKnowledgeSourcesUseCase;

  beforeEach(async () => {
    vi.useFakeTimers({ now: T0 });
    connections = new InMemoryConnections();
    sources = new InMemoryKnowledgeSources();
    documents = new InMemoryKnowledgeDocuments();
    await connections.create(NOTION, 'secret_x');
    await connections.create(LINEAR, 'lin');
    client = new FakeKnowledgeClient();
    const lines = {
      findById: vi.fn(async (id: string) => LINES.find((l) => l.id === id) ?? null),
      findBySlug: vi.fn(
        async (space: string, slug: string) =>
          LINES.find((l) => l.spaceId === space && l.slug === slug) ?? null
      ),
    } as unknown as IProductLineRepository;
    useCase = new ManageKnowledgeSourcesUseCase(
      sources,
      documents,
      connections,
      lines,
      fakeFactory(client)
    );
    return () => vi.useRealTimers();
  });

  it('adds a page tree of a Notion connection in its space, checking the page is shared', async () => {
    const result = await useCase.create({
      connection: 'acme-notion',
      scope: 'https://notion.so/root',
    });
    expect(client.describeScope).toHaveBeenCalledWith('https://notion.so/root');
    expect(result.ok && result.source).toMatchObject({
      connectionId: NOTION.id,
      spaceId: NOTION.spaceId,
      scopeId: 'root',
      scopeKind: KnowledgeScopeKind.Page,
      scopeTitle: 'Payments PRDs',
      intervalMinutes: DEFAULT_KNOWLEDGE_INTERVAL_MINUTES,
      enabled: true,
    });
  });

  it('limits a source to a product line of the connection space', async () => {
    const result = await useCase.create({
      connection: NOTION.id,
      scope: 'https://notion.so/db',
      productLine: 'pay',
      intervalMinutes: 30,
    });
    expect(result.ok && result.source).toMatchObject({
      productLineId: 'line-pay',
      scopeKind: KnowledgeScopeKind.Database,
      intervalMinutes: 30,
    });
    expect(
      await useCase.create({ connection: NOTION.id, scope: 'x', productLine: 'garden' })
    ).toEqual({
      ok: false,
      error: 'No product line "garden" in the space of Acme Notion.',
    });
  });

  it('refuses a tracker connection, a duplicate, a bad interval and an unshared page', async () => {
    expect(await useCase.create({ connection: 'linear', scope: 'x' })).toEqual({
      ok: false,
      error: 'Linear is a Linear connection, not a knowledge tool.',
    });
    await useCase.create({ connection: NOTION.id, scope: 'r' });
    expect(await useCase.create({ connection: NOTION.id, scope: 'r' })).toEqual({
      ok: false,
      error: 'Payments PRDs is already a knowledge source of Acme Notion.',
    });
    expect(await useCase.create({ connection: NOTION.id, scope: 'r', intervalMinutes: 5 })).toEqual(
      {
        ok: false,
        error: 'The interval must be between 15 and 1440 minutes.',
      }
    );
    client.describeScope.mockRejectedValueOnce(
      new ConnectionRequestError(
        'Notion: page or database x was not found, or not shared with the integration.'
      )
    );
    expect(
      await useCase.create({ connection: NOTION.id, scope: 'x', productLine: 'pay' })
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not shared/),
    });
  });

  it('lists sources with their connection and document count, pauses and removes them with their documents', async () => {
    const created = await useCase.create({ connection: NOTION.id, scope: 'r' });
    if (!created.ok) throw new Error(created.error);
    await documents.create({
      id: 'd1',
      sourceId: created.source.id,
      spaceId: NOTION.spaceId,
      pageId: 'p',
      title: 'Refunds',
      url: 'u',
      content: 'c',
      pageEditedAt: T0,
      createdAt: T0,
      updatedAt: T0,
    });
    expect(await useCase.list()).toEqual([
      { source: created.source, connection: NOTION, documents: 1 },
    ]);
    expect((await useCase.setEnabled(created.source.id, false)).ok).toBe(true);
    expect((await sources.findById(created.source.id))?.enabled).toBe(false);
    expect((await useCase.remove(created.source.id)).ok).toBe(true);
    expect(sources.rows.size).toBe(0);
    expect(documents.rows.size).toBe(0);
    expect(await useCase.remove('nope')).toEqual({
      ok: false,
      error: 'No knowledge source "nope".',
    });
  });
});
