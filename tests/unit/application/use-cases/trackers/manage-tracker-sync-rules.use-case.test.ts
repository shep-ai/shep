import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageTrackerSyncRulesUseCase } from '@/application/use-cases/trackers/manage-tracker-sync-rules.use-case.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import {
  TrackerConnectionStatus,
  TrackerProvider,
  TrackerSyncDirection,
  type TrackerConnection,
} from '@/domain/generated/output.js';
import {
  InMemoryTrackerConnections,
  InMemoryTrackerLinks,
  InMemoryTrackerRules,
} from '../../../../helpers/tracker-repositories.mock.js';

const T = new Date('2026-10-01T00:00:00Z');
const conn = (provider: TrackerProvider, slug: string): TrackerConnection => ({
  id: `conn-${slug}`,
  provider,
  name: slug,
  slug,
  spaceId: 's',
  status: TrackerConnectionStatus.Connected,
  createdAt: T,
  updatedAt: T,
});
const PROJECT = { id: 'project-pay', slug: 'pay', name: 'Payments' };

describe('ManageTrackerSyncRulesUseCase', () => {
  let rules: InMemoryTrackerRules;
  let links: InMemoryTrackerLinks;
  let useCase: ManageTrackerSyncRulesUseCase;

  beforeEach(async () => {
    const connections = new InMemoryTrackerConnections();
    await connections.create(conn(TrackerProvider.Linear, 'linear'), 'k');
    await connections.create(conn(TrackerProvider.Jira, 'jira'), 'k');
    rules = new InMemoryTrackerRules();
    links = new InMemoryTrackerLinks();
    const projects = {
      findById: vi.fn(async (id: string) => (id === PROJECT.id ? PROJECT : null)),
      findBySlug: vi.fn(async (slug: string) => (slug === 'pay' ? PROJECT : null)),
    } as unknown as IPmProjectRepository;
    useCase = new ManageTrackerSyncRulesUseCase(rules, connections, links, projects);
  });

  it('creates an import rule for a Linear team with defaults, upper-casing the key', async () => {
    const result = await useCase.create({ connection: 'linear', project: 'pay', scope: ' eng ' });
    expect(result.ok).toBe(true);
    expect(await rules.list()).toEqual([
      expect.objectContaining({
        connectionId: 'conn-linear',
        projectId: PROJECT.id,
        scope: 'ENG',
        direction: TrackerSyncDirection.Import,
        intervalMinutes: 15,
        enabled: true,
      }),
    ]);
  });

  it('keeps Jira JQL as written and accepts two-way and an interval', async () => {
    await useCase.create({
      connection: 'jira',
      project: PROJECT.id,
      scope: 'project = PAY AND type = Bug',
      direction: TrackerSyncDirection.TwoWay,
      intervalMinutes: 60,
    });
    expect((await rules.list())[0]).toMatchObject({
      scope: 'project = PAY AND type = Bug',
      direction: TrackerSyncDirection.TwoWay,
      intervalMinutes: 60,
    });
  });

  it.each([
    [{ scope: 'eng team' }, 'team key'],
    [{ scope: '' }, 'scope'],
    [{ intervalMinutes: 1 }, '5'],
    [{ intervalMinutes: 2000 }, '1440'],
    [{ project: 'nope' }, 'No project "nope"'],
    [{ connection: 'nope' }, 'No connection "nope"'],
  ])('refuses %o', async (override, message) => {
    const result = await useCase.create({
      connection: 'linear',
      project: 'pay',
      scope: 'ENG',
      ...override,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it('refuses the same scope into the same project twice', async () => {
    await useCase.create({ connection: 'linear', project: 'pay', scope: 'ENG' });
    const again = await useCase.create({ connection: 'linear', project: 'pay', scope: 'eng' });
    expect(again.ok).toBe(false);
  });

  it('lists by connection, enables and disables, and removes a rule with its links', async () => {
    const created = await useCase.create({ connection: 'linear', project: 'pay', scope: 'ENG' });
    if (!created.ok) throw new Error(created.error);
    const id = created.rule.id;
    await links.upsert({
      workItemId: 'wi',
      ruleId: id,
      connectionId: 'conn-linear',
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

    expect(await useCase.list('linear')).toEqual({
      ok: true,
      rules: [expect.objectContaining({ id })],
    });
    expect(await useCase.list('jira')).toEqual({ ok: true, rules: [] });
    await useCase.setEnabled(id, false);
    expect((await rules.findById(id))?.enabled).toBe(false);
    expect((await useCase.remove(id)).ok).toBe(true);
    expect(await rules.list()).toEqual([]);
    expect(await links.findByWorkItemId('wi')).toBeNull();
  });
});
