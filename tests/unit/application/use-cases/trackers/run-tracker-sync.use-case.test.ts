import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { RunTrackerSyncUseCase } from '@/application/use-cases/trackers/run-tracker-sync.use-case.js';
import type { CreateWorkItemUseCase } from '@/application/use-cases/work-items/create-work-item.use-case.js';
import type { UpdateWorkItemUseCase } from '@/application/use-cases/work-items/update-work-item.use-case.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import {
  TrackerAuthError,
  TrackerRateLimitError,
  type ITrackerClient,
  type TrackerIssueChanges,
  type TrackerIssuePage,
} from '@/application/ports/output/services/tracker-client.interface.js';
import {
  Priority,
  StateGroup,
  ConnectionStatus,
  ConnectionProvider,
  TrackerSyncDirection,
  type ExternalIssue,
  type TrackerSyncRule,
  type WorkItem,
  type WorkItemState,
} from '@/domain/generated/output.js';
import {
  InMemoryConnections,
  InMemoryTrackerLinks,
  InMemoryTrackerRules,
} from '../../../../helpers/tracker-repositories.mock.js';

const T0 = new Date('2026-10-01T00:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const STATES: WorkItemState[] = (
  [
    ['st-backlog', StateGroup.Backlog, 0, false],
    ['st-todo', StateGroup.Unstarted, 1, true],
    ['st-doing', StateGroup.Started, 2, false],
    ['st-done', StateGroup.Completed, 3, false],
  ] as const
).map(([id, stateGroup, displayOrder, isDefault]) => ({
  id,
  projectId: 'p',
  name: id,
  color: '#000',
  displayOrder,
  stateGroup,
  isDefault,
  createdAt: T0,
  updatedAt: T0,
})) as WorkItemState[];

function issue(over: Partial<ExternalIssue> = {}): ExternalIssue {
  return {
    externalId: 'ext-1',
    key: 'ENG-1',
    url: 'https://tracker/ENG-1',
    title: 'Fix refunds',
    description: 'Steps',
    stateGroup: StateGroup.Unstarted,
    stateName: 'Todo',
    priority: Priority.High,
    updatedAt: at(10),
    ...over,
  };
}

/** A tracker that serves scripted pages and records writes. */
class FakeTracker implements ITrackerClient {
  pages: (TrackerIssuePage | Error)[] = [];
  searches: { since?: Date; page?: string }[] = [];
  updates: { externalId: string; changes: TrackerIssueChanges }[] = [];
  async testConnection() {
    return { name: 'x' };
  }
  async searchUpdatedSince(_scope: string, since: Date | undefined, page?: string) {
    this.searches.push({ since, page });
    const next = this.pages.shift() ?? { issues: [] };
    if (next instanceof Error) throw next;
    return next;
  }
  async updateIssue(_scope: string, externalId: string, changes: TrackerIssueChanges) {
    this.updates.push({ externalId, changes });
  }
}

/** Work items with create/update use cases that behave like the real ones. */
class FakeWorkItems {
  readonly items = new Map<string, WorkItem>();
  private seq = 0;
  failNextCreate = false;
  readonly repo = {
    findById: async (id: string) => this.items.get(id) ?? null,
  } as unknown as IWorkItemRepository;
  readonly create = {
    execute: async (input: {
      projectId: string;
      title: string;
      description?: string;
      stateId?: string;
      priority?: string;
    }) => {
      if (this.failNextCreate) {
        this.failNextCreate = false;
        return { ok: false, error: 'disk full' };
      }
      const id = `wi-${++this.seq}`;
      const item = {
        id,
        projectId: input.projectId,
        sequenceId: this.seq,
        identifierPrefix: 'PAY',
        title: input.title,
        description: input.description,
        stateId: input.stateId ?? 'st-todo',
        priority: (input.priority ?? Priority.None) as Priority,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as WorkItem;
      this.items.set(id, item);
      return { ok: true, workItem: item };
    },
  } as unknown as CreateWorkItemUseCase;
  readonly update = {
    execute: async (id: string, input: Partial<WorkItem>) => {
      const item = this.items.get(id)!;
      this.items.set(id, { ...item, ...input, updatedAt: new Date() });
      return { ok: true };
    },
  } as unknown as UpdateWorkItemUseCase;
  /** An edit made in shep, after the last sync. */
  edit(id: string, change: Partial<WorkItem>) {
    const item = this.items.get(id)!;
    this.items.set(id, { ...item, ...change, updatedAt: new Date(Date.now() + 1000) });
  }
}

describe('RunTrackerSyncUseCase', () => {
  let connections: InMemoryConnections;
  let rules: InMemoryTrackerRules;
  let links: InMemoryTrackerLinks;
  let tracker: FakeTracker;
  let workItems: FakeWorkItems;
  let useCase: RunTrackerSyncUseCase;

  async function addRule(direction = TrackerSyncDirection.TwoWay): Promise<TrackerSyncRule> {
    const rule: TrackerSyncRule = {
      id: 'rule-1',
      connectionId: 'conn',
      projectId: 'p',
      scope: 'ENG',
      direction,
      intervalMinutes: 15,
      enabled: true,
      createdAt: T0,
      updatedAt: T0,
    };
    await rules.create(rule);
    return rule;
  }

  async function run() {
    const result = await useCase.execute('rule-1');
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  beforeEach(async () => {
    connections = new InMemoryConnections();
    await connections.create(
      {
        id: 'conn',
        provider: ConnectionProvider.Linear,
        name: 'L',
        slug: 'l',
        spaceId: 's',
        status: ConnectionStatus.Connected,
        createdAt: T0,
        updatedAt: T0,
      },
      'secret'
    );
    rules = new InMemoryTrackerRules();
    links = new InMemoryTrackerLinks();
    tracker = new FakeTracker();
    workItems = new FakeWorkItems();
    const states = { listByProject: async () => STATES } as unknown as IWorkItemStateRepository;
    useCase = new RunTrackerSyncUseCase(
      rules,
      connections,
      links,
      { create: () => tracker },
      workItems.repo,
      states,
      workItems.create,
      workItems.update
    );
  });

  it('imports new issues with mapped state and priority, links them and moves the cursor', async () => {
    await addRule();
    tracker.pages = [
      {
        issues: [
          issue(),
          issue({
            externalId: 'ext-2',
            key: 'ENG-2',
            stateGroup: StateGroup.Started,
            updatedAt: at(20),
          }),
        ],
      },
    ];

    const { summary, rule } = await run();

    expect(summary).toMatchObject({ created: 2, updated: 0, pushed: 0, failed: 0 });
    expect([...workItems.items.values()].map((w) => [w.title, w.stateId, w.priority])).toEqual([
      ['Fix refunds', 'st-todo', Priority.High],
      ['Fix refunds', 'st-doing', Priority.High],
    ]);
    expect(await links.findByExternalId('conn', 'ext-2')).toMatchObject({
      externalKey: 'ENG-2',
      syncedStateGroup: StateGroup.Started,
    });
    expect(rule.cursor).toEqual(at(20));
    expect(rule.lastRun).toEqual(summary);
    expect(rule.lastError).toBeUndefined();
  });

  it('asks only for issues updated since the cursor, and changes nothing for an unchanged issue', async () => {
    await addRule();
    tracker.pages = [{ issues: [issue()] }];
    await run();
    tracker.pages = [{ issues: [issue()] }];

    const { summary } = await run();

    expect(tracker.searches[1].since).toEqual(at(10));
    expect(summary).toMatchObject({ created: 0, updated: 0, pushed: 0, conflicts: 0 });
    expect(workItems.items.size).toBe(1);
  });

  it('applies a remote change to the work item and the snapshot', async () => {
    await addRule();
    tracker.pages = [{ issues: [issue()] }];
    await run();
    tracker.pages = [
      {
        issues: [
          issue({
            title: 'Fix partial refunds',
            stateGroup: StateGroup.Completed,
            updatedAt: at(30),
          }),
        ],
      },
    ];

    const { summary } = await run();

    expect(summary.updated).toBe(1);
    expect(workItems.items.get('wi-1')).toMatchObject({
      title: 'Fix partial refunds',
      stateId: 'st-done',
    });
    expect(await links.findByWorkItemId('wi-1')).toMatchObject({
      syncedTitle: 'Fix partial refunds',
      syncedStateGroup: StateGroup.Completed,
    });
  });

  it('pushes a shep edit of an issue that did not change remotely (two-way)', async () => {
    await addRule();
    tracker.pages = [{ issues: [issue()] }];
    await run();
    workItems.edit('wi-1', { stateId: 'st-done', priority: Priority.Urgent });

    const { summary } = await run();

    expect(summary.pushed).toBe(1);
    expect(tracker.updates).toEqual([
      {
        externalId: 'ext-1',
        changes: { stateGroup: StateGroup.Completed, priority: Priority.Urgent },
      },
    ]);
    expect(await links.findByWorkItemId('wi-1')).toMatchObject({
      syncedStateGroup: StateGroup.Completed,
      syncedPriority: Priority.Urgent,
    });

    const again = await run();
    expect(again.summary.pushed).toBe(0);
  });

  it('never pushes from an import rule', async () => {
    await addRule(TrackerSyncDirection.Import);
    tracker.pages = [{ issues: [issue()] }];
    await run();
    workItems.edit('wi-1', { title: 'Local only' });

    const { summary } = await run();

    expect(summary.pushed).toBe(0);
    expect(tracker.updates).toEqual([]);
    expect(workItems.items.get('wi-1')?.title).toBe('Local only');
  });

  it('takes the tracker value for a field changed on both sides and counts the conflict', async () => {
    await addRule();
    tracker.pages = [{ issues: [issue()] }];
    await run();
    workItems.edit('wi-1', { title: 'Local title' });
    tracker.pages = [{ issues: [issue({ title: 'Remote title', updatedAt: at(30) })] }];

    const { summary } = await run();

    expect(summary.conflicts).toBe(1);
    expect(workItems.items.get('wi-1')?.title).toBe('Remote title');
    expect(tracker.updates).toEqual([]);
  });

  it('reads every page before moving the cursor', async () => {
    await addRule();
    tracker.pages = [
      { issues: [issue({ updatedAt: at(50) })], nextPage: 'p2' },
      { issues: [issue({ externalId: 'ext-2', key: 'ENG-2', updatedAt: at(40) })] },
    ];

    const { summary, rule } = await run();

    expect(tracker.searches.map((s) => s.page)).toEqual([undefined, 'p2']);
    expect(summary.created).toBe(2);
    expect(rule.cursor).toEqual(at(50));
  });

  it('keeps the cursor and reports a rate limit that stops the run', async () => {
    await addRule();
    tracker.pages = [
      { issues: [issue()], nextPage: 'p2' },
      new TrackerRateLimitError('Linear: rate limited', 30_000),
    ];

    const { summary, rule, error } = await run();

    expect(summary).toMatchObject({ created: 1, rateLimited: true });
    expect(error).toBe('Linear: rate limited');
    expect(rule.cursor).toBeUndefined();
    expect(rule.lastError).toBe('Linear: rate limited');
  });

  it('marks the connection broken on rejected credentials and healthy after a clean run', async () => {
    await addRule();
    tracker.pages = [new TrackerAuthError('Linear: revoked')];
    await run();
    expect(await connections.findById('conn')).toMatchObject({
      status: ConnectionStatus.Error,
      lastError: 'Linear: revoked',
    });

    tracker.pages = [{ issues: [] }];
    await run();
    const healed = await connections.findById('conn');
    expect(healed?.status).toBe(ConnectionStatus.Connected);
    expect(healed?.lastError).toBeUndefined();
  });

  it('counts an issue that fails and carries on with the rest', async () => {
    await addRule();
    workItems.failNextCreate = true;
    tracker.pages = [{ issues: [issue(), issue({ externalId: 'ext-2', key: 'ENG-2' })] }];

    const { summary } = await run();

    expect(summary).toMatchObject({ created: 1, failed: 1 });
  });

  it('does not re-import an issue whose work item was deleted in shep', async () => {
    await addRule();
    tracker.pages = [{ issues: [issue()] }];
    await run();
    workItems.items.delete('wi-1');
    tracker.pages = [{ issues: [issue({ title: 'Changed', updatedAt: at(30) })] }];

    const { summary } = await run();

    expect(summary).toMatchObject({ created: 0, updated: 0 });
    expect(workItems.items.size).toBe(0);
  });

  it('reports an unknown rule', async () => {
    expect(await useCase.execute('nope')).toEqual({ ok: false, error: 'No sync rule "nope".' });
  });
});
