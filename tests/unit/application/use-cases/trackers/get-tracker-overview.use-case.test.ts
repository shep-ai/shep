import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { GetTrackerOverviewUseCase } from '@/application/use-cases/trackers/get-tracker-overview.use-case.js';
import type { ManageTrackerSyncRulesUseCase } from '@/application/use-cases/trackers/manage-tracker-sync-rules.use-case.js';
import type { ManageKnowledgeSourcesUseCase } from '@/application/use-cases/knowledge/manage-knowledge-sources.use-case.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import {
  ConnectionStatus,
  ConnectionProvider,
  KnowledgeScopeKind,
  TrackerSyncDirection,
} from '@/domain/generated/output.js';
import {
  DEFAULT_SPACE,
  createMockProductLineRepository,
  createMockSpaceRepository,
} from '../../../../helpers/space-repositories.mock.js';
import { InMemoryConnections } from '../../../../helpers/tracker-repositories.mock.js';

const T = new Date('2026-10-01T00:00:00Z');

describe('GetTrackerOverviewUseCase', () => {
  it('groups rules and knowledge sources under their connection with names', async () => {
    const connections = new InMemoryConnections();
    const conn = {
      id: 'c1',
      provider: ConnectionProvider.Linear,
      name: 'Acme Linear',
      slug: 'acme-linear',
      spaceId: DEFAULT_SPACE.id,
      status: ConnectionStatus.Connected,
      createdAt: T,
      updatedAt: T,
    };
    await connections.create(conn, 'secret');
    const notion = {
      ...conn,
      id: 'c2',
      provider: ConnectionProvider.Notion,
      name: 'Acme Notion',
      slug: 'acme-notion',
    };
    await connections.create(notion, 'secret');
    const rule = {
      id: 'r1',
      connectionId: 'c1',
      projectId: 'p1',
      scope: 'ENG',
      direction: TrackerSyncDirection.Import,
      intervalMinutes: 15,
      enabled: true,
      createdAt: T,
      updatedAt: T,
    };
    const view = {
      rule,
      connection: { name: conn.name, slug: conn.slug, provider: conn.provider },
      project: { name: 'Payments', slug: 'pay' },
    };
    const rules = {
      list: vi.fn().mockResolvedValue({ ok: true, rules: [view] }),
    } as unknown as ManageTrackerSyncRulesUseCase;
    const sourceView = {
      source: {
        id: 's1',
        connectionId: 'c2',
        spaceId: DEFAULT_SPACE.id,
        scopeId: 'page',
        scopeKind: KnowledgeScopeKind.Page,
        scopeTitle: 'Handbook',
        intervalMinutes: 60,
        enabled: true,
        createdAt: T,
        updatedAt: T,
      },
      connection: notion,
      documents: 2,
    };
    const knowledge = {
      list: vi.fn().mockResolvedValue([sourceView]),
    } as unknown as ManageKnowledgeSourcesUseCase;
    const productLines = createMockProductLineRepository();
    productLines.listAll.mockResolvedValue([
      { id: 'pl1', spaceId: DEFAULT_SPACE.id, name: 'Platform', slug: 'platform' },
    ]);
    const projects = {
      list: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Payments', slug: 'pay' }]),
    } as unknown as IPmProjectRepository;

    const overview = await new GetTrackerOverviewUseCase(
      connections,
      rules,
      knowledge,
      createMockSpaceRepository(),
      productLines,
      projects
    ).execute();

    expect(overview).toEqual({
      connections: [
        { connection: conn, spaceName: DEFAULT_SPACE.name, rules: [view], sources: [] },
        { connection: notion, spaceName: DEFAULT_SPACE.name, rules: [], sources: [sourceView] },
      ],
      spaces: [{ id: DEFAULT_SPACE.id, name: DEFAULT_SPACE.name }],
      productLines: [{ id: 'pl1', spaceId: DEFAULT_SPACE.id, name: 'Platform' }],
      projects: [{ id: 'p1', name: 'Payments', slug: 'pay' }],
    });
  });
});
