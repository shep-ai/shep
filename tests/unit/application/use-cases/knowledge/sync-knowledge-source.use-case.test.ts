import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SyncKnowledgeSourceUseCase } from '@/application/use-cases/knowledge/sync-knowledge-source.use-case.js';
import {
  ConnectionAuthError,
  ConnectionRateLimitError,
} from '@/application/ports/output/services/connection-errors.js';
import { ConnectionStatus } from '@/domain/generated/output.js';
import { MAX_DOCUMENT_CHARS } from '@/domain/shared/knowledge.js';
import { InMemoryConnections } from '../../../../helpers/tracker-repositories.mock.js';
import {
  InMemoryKnowledgeDocuments,
  InMemoryKnowledgeSources,
} from '../../../../helpers/knowledge-repositories.mock.js';
import {
  FakeKnowledgeClient,
  NOTION,
  SOURCE,
  T0,
  fakeFactory,
  pageRef,
} from './knowledge.fixtures.js';

describe('SyncKnowledgeSourceUseCase', () => {
  let connections: InMemoryConnections;
  let sources: InMemoryKnowledgeSources;
  let documents: InMemoryKnowledgeDocuments;
  let client: FakeKnowledgeClient;
  let factory: ReturnType<typeof fakeFactory>;
  let useCase: SyncKnowledgeSourceUseCase;

  beforeEach(async () => {
    vi.useFakeTimers({ now: T0 });
    connections = new InMemoryConnections();
    sources = new InMemoryKnowledgeSources();
    documents = new InMemoryKnowledgeDocuments();
    await connections.create(NOTION, 'secret_x');
    await sources.create(SOURCE);
    client = new FakeKnowledgeClient();
    client.pages = [pageRef('root', 0, 'Payments PRDs'), pageRef('refunds', 0, 'Refunds')];
    client.contents.set('root', '# PRDs');
    client.contents.set('refunds', '# Refunds\n\nGuests by email.');
    factory = fakeFactory(client);
    useCase = new SyncKnowledgeSourceUseCase(sources, documents, connections, factory);
  });
  afterEach(() => vi.useRealTimers());

  it('stores every page of the scope as a document in the source space', async () => {
    const result = await useCase.execute(SOURCE.id);
    expect(factory.create).toHaveBeenCalledWith({ provider: NOTION.provider, secret: 'secret_x' });
    expect(client.listPages).toHaveBeenCalledWith({
      id: 'root',
      kind: SOURCE.scopeKind,
      title: SOURCE.scopeTitle,
    });
    expect(result).toMatchObject({
      ok: true,
      summary: { added: 2, updated: 0, removed: 0, failed: 0 },
    });
    expect(
      (await documents.listBySource(SOURCE.id)).map((d) => [d.title, d.content, d.spaceId])
    ).toEqual([
      ['Payments PRDs', '# PRDs', 'space-acme'],
      ['Refunds', '# Refunds\n\nGuests by email.', 'space-acme'],
    ]);
    expect(await sources.findById(SOURCE.id)).toMatchObject({
      lastRunAt: T0,
      lastRun: { added: 2, updated: 0, removed: 0, failed: 0 },
    });
  });

  it('reads only edited pages the next time, and forgets removed ones', async () => {
    await useCase.execute(SOURCE.id);
    client.reads = [];
    client.pages = [pageRef('root', 0, 'Payments PRDs'), pageRef('pricing', 5, 'Pricing')];
    client.contents.set('pricing', 'Ten dollars.');
    client.pages[0] = pageRef('root', 10, 'PRDs (renamed)');
    client.contents.set('root', '# PRDs v2');

    const result = await useCase.execute(SOURCE.id);
    expect(client.reads.sort()).toEqual(['pricing', 'root']);
    expect(result).toMatchObject({ summary: { added: 1, updated: 1, removed: 1, failed: 0 } });
    expect((await documents.listBySource(SOURCE.id)).map((d) => [d.title, d.content])).toEqual([
      ['PRDs (renamed)', '# PRDs v2'],
      ['Pricing', 'Ten dollars.'],
    ]);
  });

  it('keeps the product line of the source on its documents, and cuts very long pages', async () => {
    await sources.update({ ...SOURCE, productLineId: 'line-pay' });
    client.contents.set('refunds', 'x'.repeat(MAX_DOCUMENT_CHARS + 50));
    await useCase.execute(SOURCE.id);
    const docs = await documents.listBySource(SOURCE.id);
    expect(docs.every((d) => d.productLineId === 'line-pay')).toBe(true);
    expect(docs.find((d) => d.pageId === 'refunds')?.content).toHaveLength(MAX_DOCUMENT_CHARS);
  });

  it('counts a page that cannot be read and carries on', async () => {
    client.contents.delete('refunds');
    const result = await useCase.execute(SOURCE.id);
    expect(result).toMatchObject({ summary: { added: 1, failed: 1 } });
  });

  it('stops on a rejected token, marking the connection, and keeps the documents', async () => {
    await useCase.execute(SOURCE.id);
    client.listPages.mockRejectedValueOnce(
      new ConnectionAuthError('Notion: API token is invalid.')
    );
    const result = await useCase.execute(SOURCE.id);
    expect(result).toMatchObject({ ok: true, error: 'Notion: API token is invalid.' });
    expect((await connections.findById(NOTION.id))?.status).toBe(ConnectionStatus.Error);
    expect(await documents.listBySource(SOURCE.id)).toHaveLength(2);
    expect((await sources.findById(SOURCE.id))?.lastError).toBe('Notion: API token is invalid.');

    const recovered = await useCase.execute(SOURCE.id);
    expect(recovered).not.toHaveProperty('error');
    expect((await connections.findById(NOTION.id))?.status).toBe(ConnectionStatus.Connected);
  });

  it('stops on a rate limit while reading pages, without deleting anything', async () => {
    await useCase.execute(SOURCE.id);
    client.pages = [pageRef('root', 10)];
    client.readPage.mockRejectedValueOnce(new ConnectionRateLimitError('Notion: slow down'));
    const result = await useCase.execute(SOURCE.id);
    expect(result).toMatchObject({ error: 'Notion: slow down' });
    expect(await documents.listBySource(SOURCE.id)).toHaveLength(2);
  });

  it('refuses an unknown source or a missing connection', async () => {
    expect(await useCase.execute('nope')).toEqual({
      ok: false,
      error: 'No knowledge source "nope".',
    });
    await connections.delete(NOTION.id);
    expect(await useCase.execute(SOURCE.id)).toEqual({
      ok: false,
      error: 'The connection of knowledge source Payments PRDs no longer exists.',
    });
  });
});
