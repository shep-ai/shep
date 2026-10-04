import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageTrackerConnectionsUseCase } from '@/application/use-cases/trackers/manage-tracker-connections.use-case.js';
import {
  TrackerAuthError,
  type ITrackerClient,
  type ITrackerClientFactory,
} from '@/application/ports/output/services/tracker-client.interface.js';
import {
  TrackerConnectionStatus,
  TrackerProvider,
  TrackerSyncDirection,
} from '@/domain/generated/output.js';
import {
  DEFAULT_SPACE,
  createMockSpaceRepository,
} from '../../../../helpers/space-repositories.mock.js';
import {
  InMemoryTrackerConnections,
  InMemoryTrackerLinks,
  InMemoryTrackerRules,
} from '../../../../helpers/tracker-repositories.mock.js';

describe('ManageTrackerConnectionsUseCase', () => {
  let connections: InMemoryTrackerConnections;
  let rules: InMemoryTrackerRules;
  let links: InMemoryTrackerLinks;
  let client: { testConnection: ReturnType<typeof vi.fn> };
  let factory: ITrackerClientFactory & { create: ReturnType<typeof vi.fn> };
  let useCase: ManageTrackerConnectionsUseCase;

  beforeEach(() => {
    connections = new InMemoryTrackerConnections();
    rules = new InMemoryTrackerRules();
    links = new InMemoryTrackerLinks();
    client = { testConnection: vi.fn().mockResolvedValue({ name: 'Ada' }) };
    factory = { create: vi.fn().mockReturnValue(client as unknown as ITrackerClient) };
    const spaces = createMockSpaceRepository({
      findById: vi.fn(async () => null),
      findBySlug: vi.fn(async (slug: string) => (slug === 'default' ? DEFAULT_SPACE : null)),
    });
    useCase = new ManageTrackerConnectionsUseCase(connections, rules, links, factory, spaces);
  });

  it('tests a Linear key before saving it, in the default space', async () => {
    const result = await useCase.create({
      provider: TrackerProvider.Linear,
      name: 'Acme Linear',
      secret: ' lin_api_x ',
    });
    expect(result.ok).toBe(true);
    expect(factory.create).toHaveBeenCalledWith({
      provider: TrackerProvider.Linear,
      secret: 'lin_api_x',
    });
    const [saved] = await connections.list();
    expect(saved).toMatchObject({
      name: 'Acme Linear',
      slug: 'acme-linear',
      spaceId: DEFAULT_SPACE.id,
      accountName: 'Ada',
      status: TrackerConnectionStatus.Connected,
    });
    expect(await connections.getSecret(saved.id)).toBe('lin_api_x');
    if (result.ok) expect(JSON.stringify(result)).not.toContain('lin_api_x');
  });

  it('requires a Jira site URL and email, and normalises the site', async () => {
    expect(
      (await useCase.create({ provider: TrackerProvider.Jira, name: 'J', secret: 't' })).ok
    ).toBe(false);
    const result = await useCase.create({
      provider: TrackerProvider.Jira,
      name: 'Acme Jira',
      siteUrl: 'https://acme.atlassian.net/',
      accountEmail: 'me@acme.com',
      secret: 't',
      space: 'default',
    });
    expect(result.ok).toBe(true);
    expect(factory.create).toHaveBeenCalledWith({
      provider: TrackerProvider.Jira,
      siteUrl: 'https://acme.atlassian.net',
      accountEmail: 'me@acme.com',
      secret: 't',
    });
  });

  it('refuses a non-https Jira site', async () => {
    const result = await useCase.create({
      provider: TrackerProvider.Jira,
      name: 'J',
      siteUrl: 'http://acme.atlassian.net',
      accountEmail: 'me@acme.com',
      secret: 't',
    });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('https') });
  });

  it('saves nothing when the credentials fail', async () => {
    client.testConnection.mockRejectedValue(
      new TrackerAuthError('Linear: Authentication required')
    );
    const result = await useCase.create({
      provider: TrackerProvider.Linear,
      name: 'L',
      secret: 'bad',
    });
    expect(result).toEqual({ ok: false, error: 'Linear: Authentication required' });
    expect(await connections.list()).toEqual([]);
  });

  it('refuses a duplicate name and an unknown space', async () => {
    await useCase.create({ provider: TrackerProvider.Linear, name: 'L', secret: 'k' });
    expect(
      (await useCase.create({ provider: TrackerProvider.Linear, name: 'L', secret: 'k' })).ok
    ).toBe(false);
    expect(
      await useCase.create({
        provider: TrackerProvider.Linear,
        name: 'M',
        secret: 'k',
        space: 'nope',
      })
    ).toEqual({ ok: false, error: 'No space "nope".' });
  });

  it('re-tests a connection and records the outcome', async () => {
    await useCase.create({ provider: TrackerProvider.Linear, name: 'L', secret: 'k' });
    client.testConnection.mockRejectedValue(new TrackerAuthError('Linear: revoked'));

    const result = await useCase.test('l');

    expect(result).toEqual({ ok: false, error: 'Linear: revoked' });
    expect(await connections.findBySlug('l')).toMatchObject({
      status: TrackerConnectionStatus.Error,
      lastError: 'Linear: revoked',
    });
  });

  it('removes a connection with its rules and links, keeping work items', async () => {
    await useCase.create({ provider: TrackerProvider.Linear, name: 'L', secret: 'k' });
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
