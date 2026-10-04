/**
 * Tracker sync (integration, spec 122)
 *
 * Real DI container and SQLite, with only the tracker faked: a connection and
 * a two-way rule import issues as work items of a real project, a re-run is a
 * no-op, a remote edit lands, a shep edit is pushed, and a field changed on
 * both sides takes the tracker's value.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { container as rootContainer, type DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { registerRepositories } from '@/infrastructure/di/modules/register-repositories.js';
import { registerSpaces } from '@/infrastructure/di/modules/register-spaces.js';
import { registerTrackers } from '@/infrastructure/di/modules/register-trackers.js';
import { registerKnowledge } from '@/infrastructure/di/modules/register-knowledge.js';
import { LocalSecretBox } from '@/infrastructure/services/crypto/local-secret-box.js';
import { CreatePmProjectUseCase } from '@/application/use-cases/pm-projects/create-pm-project.use-case.js';
import { UpdateWorkItemUseCase } from '@/application/use-cases/work-items/update-work-item.use-case.js';
import { ManageConnectionsUseCase } from '@/application/use-cases/connections/manage-connections.use-case.js';
import { ManageTrackerSyncRulesUseCase } from '@/application/use-cases/trackers/manage-tracker-sync-rules.use-case.js';
import { SyncTrackerRulesUseCase } from '@/application/use-cases/trackers/sync-tracker-rules.use-case.js';
import { GetTrackerIssueLinkUseCase } from '@/application/use-cases/trackers/get-tracker-issue-link.use-case.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import type {
  ITrackerClient,
  ITrackerClientFactory,
  TrackerIssueChanges,
} from '@/application/ports/output/services/tracker-client.interface.js';
import {
  Priority,
  StateGroup,
  ConnectionProvider,
  TrackerSyncDirection,
  type ExternalIssue,
} from '@/domain/generated/output.js';

/** A Linear team held in memory: searches honour updated-since, writes bump updatedAt. */
class FakeLinear implements ITrackerClient {
  issues = new Map<string, ExternalIssue>();
  private clock = Date.parse('2026-10-01T00:00:00Z');
  touch(id: string, change: Partial<ExternalIssue>) {
    this.clock += 60_000;
    const current = this.issues.get(id);
    this.issues.set(id, {
      ...(current ?? {
        externalId: id,
        key: `ENG-${id}`,
        url: `https://linear.app/acme/issue/ENG-${id}`,
        title: id,
        stateGroup: StateGroup.Unstarted,
        stateName: 'Todo',
        priority: Priority.None,
        updatedAt: new Date(0),
      }),
      ...change,
      updatedAt: new Date(this.clock),
    });
  }
  async testConnection() {
    return { name: 'Ada' };
  }
  async searchUpdatedSince(_scope: string, since: Date | undefined) {
    return { issues: [...this.issues.values()].filter((i) => !since || i.updatedAt > since) };
  }
  async updateIssue(_scope: string, externalId: string, changes: TrackerIssueChanges) {
    this.touch(externalId, changes);
  }
}

describe('Tracker sync (integration)', () => {
  let db: Database.Database;
  let c: DependencyContainer;
  let linear: FakeLinear;
  let projectId: string;

  const items = () =>
    c.resolve<IWorkItemRepository>('IWorkItemRepository').listByProject(projectId);
  const sync = async () => {
    const [result] = await c.resolve(SyncTrackerRulesUseCase).runAll();
    if (!result.ok) throw new Error(result.error);
    return result.summary;
  };
  const stateGroupOf = async (stateId: string) =>
    (await c.resolve<IWorkItemStateRepository>('IWorkItemStateRepository').findById(stateId))
      ?.stateGroup;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    c = rootContainer.createChildContainer();
    c.registerInstance<Database.Database>('Database', db);
    c.registerInstance(LocalSecretBox, new LocalSecretBox(randomBytes(32)));
    registerRepositories(c);
    registerSpaces(c);
    registerTrackers(c);
    registerKnowledge(c);
    linear = new FakeLinear();
    c.registerInstance<ITrackerClientFactory>('ITrackerClientFactory', { create: () => linear });

    const project = await c
      .resolve(CreatePmProjectUseCase)
      .execute({ name: 'Payments', identifierPrefix: 'PAY' });
    if (!project.ok) throw new Error(project.error);
    projectId = project.project.id;
    const connection = await c
      .resolve(ManageConnectionsUseCase)
      .create({ provider: ConnectionProvider.Linear, name: 'Acme Linear', secret: 'lin_api_x' });
    expect(connection.ok).toBe(true);
    const rule = await c.resolve(ManageTrackerSyncRulesUseCase).create({
      connection: 'acme-linear',
      project: projectId,
      scope: 'ENG',
      direction: TrackerSyncDirection.TwoWay,
    });
    expect(rule.ok).toBe(true);
  });

  afterEach(() => {
    c.dispose();
    db.close();
  });

  it('imports, stays idempotent, applies remote edits and pushes shep edits', async () => {
    linear.touch('1', { title: 'Fix refunds', description: 'Steps', priority: Priority.High });
    linear.touch('2', { title: 'Add receipts', stateGroup: StateGroup.Started });

    expect(await sync()).toMatchObject({ created: 2, updated: 0, pushed: 0 });
    const imported = await items();
    expect(imported.map((i) => i.title).sort()).toEqual(['Add receipts', 'Fix refunds']);
    const refunds = imported.find((i) => i.title === 'Fix refunds')!;
    expect(refunds.priority).toBe(Priority.High);
    expect(await c.resolve(GetTrackerIssueLinkUseCase).execute(refunds.id)).toMatchObject({
      externalKey: 'ENG-1',
      externalUrl: 'https://linear.app/acme/issue/ENG-1',
    });

    expect(await sync()).toMatchObject({ created: 0, updated: 0, pushed: 0 });

    linear.touch('1', { title: 'Fix partial refunds' });
    expect(await sync()).toMatchObject({ updated: 1 });
    expect((await items()).find((i) => i.id === refunds.id)?.title).toBe('Fix partial refunds');

    const states = await c
      .resolve<IWorkItemStateRepository>('IWorkItemStateRepository')
      .listByProject(projectId);
    const done = states.find((s) => s.stateGroup === StateGroup.Completed)!;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await c.resolve(UpdateWorkItemUseCase).execute(refunds.id, { stateId: done.id });
    expect(await sync()).toMatchObject({ pushed: 1 });
    expect(linear.issues.get('1')?.stateGroup).toBe(StateGroup.Completed);
    expect(await sync()).toMatchObject({ created: 0, updated: 0, pushed: 0 });
  });

  it('keeps the tracker value when both sides changed the same field', async () => {
    linear.touch('1', { title: 'Original' });
    await sync();
    const [item] = await items();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await c.resolve(UpdateWorkItemUseCase).execute(item.id, { title: 'Shep title' });
    linear.touch('1', { title: 'Linear title', stateGroup: StateGroup.Started });

    expect(await sync()).toMatchObject({ conflicts: 1, updated: 1 });
    const [after] = await items();
    expect(after.title).toBe('Linear title');
    expect(await stateGroupOf(after.stateId)).toBe(StateGroup.Started);
  });
});
