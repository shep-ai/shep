import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { GetTrackerOverviewUseCase } from '@/application/use-cases/trackers/get-tracker-overview.use-case.js';
import type { ManageTrackerSyncRulesUseCase } from '@/application/use-cases/trackers/manage-tracker-sync-rules.use-case.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import {
  TrackerConnectionStatus,
  TrackerProvider,
  TrackerSyncDirection,
} from '@/domain/generated/output.js';
import {
  DEFAULT_SPACE,
  createMockSpaceRepository,
} from '../../../../helpers/space-repositories.mock.js';
import { InMemoryTrackerConnections } from '../../../../helpers/tracker-repositories.mock.js';

const T = new Date('2026-10-01T00:00:00Z');

describe('GetTrackerOverviewUseCase', () => {
  it('groups rules under their connection with space and project names', async () => {
    const connections = new InMemoryTrackerConnections();
    const conn = {
      id: 'c1',
      provider: TrackerProvider.Linear,
      name: 'Acme Linear',
      slug: 'acme-linear',
      spaceId: DEFAULT_SPACE.id,
      status: TrackerConnectionStatus.Connected,
      createdAt: T,
      updatedAt: T,
    };
    await connections.create(conn, 'secret');
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
    const projects = {
      list: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Payments', slug: 'pay' }]),
    } as unknown as IPmProjectRepository;

    const overview = await new GetTrackerOverviewUseCase(
      connections,
      rules,
      createMockSpaceRepository(),
      projects
    ).execute();

    expect(overview).toEqual({
      connections: [{ connection: conn, spaceName: DEFAULT_SPACE.name, rules: [view] }],
      spaces: [{ id: DEFAULT_SPACE.id, name: DEFAULT_SPACE.name }],
      projects: [{ id: 'p1', name: 'Payments', slug: 'pay' }],
    });
  });
});
