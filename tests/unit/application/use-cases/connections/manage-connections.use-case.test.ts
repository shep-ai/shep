import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageConnectionsUseCase } from '@/application/use-cases/connections/manage-connections.use-case.js';
import type { IConnectionVerifier } from '@/application/ports/output/services/connection-verifier.interface.js';
import { ConnectionAuthError } from '@/application/ports/output/services/connection-errors.js';
import {
  ConnectionStatus,
  ConnectionProvider,
  TrackerSyncDirection,
} from '@/domain/generated/output.js';
import {
  DEFAULT_SPACE,
  createMockSpaceRepository,
} from '../../../../helpers/space-repositories.mock.js';
import {
  InMemoryConnections,
  InMemoryTrackerLinks,
  InMemoryTrackerRules,
} from '../../../../helpers/tracker-repositories.mock.js';
import {
  InMemoryKnowledgeDocuments,
  InMemoryKnowledgeSources,
} from '../../../../helpers/knowledge-repositories.mock.js';

describe('ManageConnectionsUseCase', () => {
  let connections: InMemoryConnections;
  let rules: InMemoryTrackerRules;
  let links: InMemoryTrackerLinks;
  let sources: InMemoryKnowledgeSources;
  let documents: InMemoryKnowledgeDocuments;
  let verifier: IConnectionVerifier & { verify: ReturnType<typeof vi.fn> };
  let useCase: ManageConnectionsUseCase;

  beforeEach(() => {
    connections = new InMemoryConnections();
    rules = new InMemoryTrackerRules();
    links = new InMemoryTrackerLinks();
    sources = new InMemoryKnowledgeSources();
    documents = new InMemoryKnowledgeDocuments();
    verifier = { verify: vi.fn().mockResolvedValue({ name: 'Ada' }) };
    const spaces = createMockSpaceRepository({
      findById: vi.fn(async () => null),
      findBySlug: vi.fn(async (slug: string) => (slug === 'default' ? DEFAULT_SPACE : null)),
    });
    useCase = new ManageConnectionsUseCase(
      connections,
      rules,
      links,
      sources,
      documents,
      verifier,
      spaces
    );
  });

  it('tests a Linear key before saving it, in the default space', async () => {
    const result = await useCase.create({
      provider: ConnectionProvider.Linear,
      name: 'Acme Linear',
      secret: ' lin_api_x ',
    });
    expect(result.ok).toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith({
      provider: ConnectionProvider.Linear,
      secret: 'lin_api_x',
    });
    const [saved] = await connections.list();
    expect(saved).toMatchObject({
      name: 'Acme Linear',
      slug: 'acme-linear',
      spaceId: DEFAULT_SPACE.id,
      accountName: 'Ada',
      status: ConnectionStatus.Connected,
    });
    expect(await connections.getSecret(saved.id)).toBe('lin_api_x');
    if (result.ok) expect(JSON.stringify(result)).not.toContain('lin_api_x');
  });

  it('requires a Jira site URL and email, and normalises the site', async () => {
    expect(
      (await useCase.create({ provider: ConnectionProvider.Jira, name: 'J', secret: 't' })).ok
    ).toBe(false);
    const result = await useCase.create({
      provider: ConnectionProvider.Jira,
      name: 'Acme Jira',
      siteUrl: 'https://acme.atlassian.net/',
      accountEmail: 'me@acme.com',
      secret: 't',
      space: 'default',
    });
    expect(result.ok).toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith({
      provider: ConnectionProvider.Jira,
      siteUrl: 'https://acme.atlassian.net',
      accountEmail: 'me@acme.com',
      secret: 't',
    });
  });

  it('refuses a non-https Jira site', async () => {
    const result = await useCase.create({
      provider: ConnectionProvider.Jira,
      name: 'J',
      siteUrl: 'http://acme.atlassian.net',
      accountEmail: 'me@acme.com',
      secret: 't',
    });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('https') });
  });

  it('saves nothing when the credentials fail', async () => {
    verifier.verify.mockRejectedValue(new ConnectionAuthError('Linear: Authentication required'));
    const result = await useCase.create({
      provider: ConnectionProvider.Linear,
      name: 'L',
      secret: 'bad',
    });
    expect(result).toEqual({ ok: false, error: 'Linear: Authentication required' });
    expect(await connections.list()).toEqual([]);
  });

  it('refuses a duplicate name and an unknown space', async () => {
    await useCase.create({ provider: ConnectionProvider.Linear, name: 'L', secret: 'k' });
    expect(
      (await useCase.create({ provider: ConnectionProvider.Linear, name: 'L', secret: 'k' })).ok
    ).toBe(false);
    expect(
      await useCase.create({
        provider: ConnectionProvider.Linear,
        name: 'M',
        secret: 'k',
        space: 'nope',
      })
    ).toEqual({ ok: false, error: 'No space "nope".' });
  });

  it('re-tests a connection and records the outcome', async () => {
    await useCase.create({ provider: ConnectionProvider.Linear, name: 'L', secret: 'k' });
    verifier.verify.mockRejectedValue(new ConnectionAuthError('Linear: revoked'));

    const result = await useCase.test('l');

    expect(result).toEqual({ ok: false, error: 'Linear: revoked' });
    expect(await connections.findBySlug('l')).toMatchObject({
      status: ConnectionStatus.Error,
      lastError: 'Linear: revoked',
    });
  });

  it('saves a Notion connection after checking its token (spec 125)', async () => {
    verifier.verify.mockResolvedValue({ name: 'Acme workspace' });
    const result = await useCase.create({
      provider: ConnectionProvider.Notion,
      name: 'Acme Notion',
      secret: 'secret_x',
    });
    expect(result.ok && result.connection).toMatchObject({
      provider: ConnectionProvider.Notion,
      accountName: 'Acme workspace',
    });
    expect(verifier.verify).toHaveBeenCalledWith({
      provider: ConnectionProvider.Notion,
      secret: 'secret_x',
    });
  });

  it('removes a knowledge connection with its sources and documents (spec 125)', async () => {
    await useCase.create({ provider: ConnectionProvider.Notion, name: 'N', secret: 't' });
    const [connection] = await connections.list();
    const T = new Date();
    await sources.create({
      id: 's1',
      connectionId: connection.id,
      spaceId: 's',
      scopeId: 'p',
      scopeKind: 'Page' as never,
      scopeTitle: 'Root',
      intervalMinutes: 60,
      enabled: true,
      createdAt: T,
      updatedAt: T,
    });
    await documents.create({
      id: 'd1',
      sourceId: 's1',
      spaceId: 's',
      pageId: 'p',
      title: 'Root',
      url: 'u',
      content: 'c',
      pageEditedAt: T,
      createdAt: T,
      updatedAt: T,
    });
    expect((await useCase.remove('n')).ok).toBe(true);
    expect(sources.rows.size).toBe(0);
    expect(documents.rows.size).toBe(0);
    expect(await connections.list()).toEqual([]);
  });

  it('removes a connection with its rules and links, keeping work items', async () => {
    await useCase.create({ provider: ConnectionProvider.Linear, name: 'L', secret: 'k' });
    const [connection] = await connections.list();
    const T = new Date();
    await rules.create({
      id: 'r1',
      connectionId: connection.id,
      projectId: 'p',
      scope: 'ENG',
      direction: TrackerSyncDirection.Import,
      intervalMinutes: 15,
      enabled: true,
      createdAt: T,
      updatedAt: T,
    });
    await links.upsert({
      workItemId: 'wi',
      ruleId: 'r1',
      connectionId: connection.id,
      externalId: 'x',
      externalKey: 'ENG-1',
      externalUrl: 'u',
      syncedTitle: 't',
      syncedStateGroup: 'Started' as never,
      syncedPriority: 'None' as never,
      remoteUpdatedAt: T,
      createdAt: T,
      updatedAt: T,
    });

    expect((await useCase.remove('l')).ok).toBe(true);
    expect(await connections.list()).toEqual([]);
    expect(await rules.list()).toEqual([]);
    expect(await links.findByWorkItemId('wi')).toBeNull();
  });
});
