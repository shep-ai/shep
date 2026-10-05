/**
 * Incident repositories (spec 129): migration 162, every field through both
 * column lists, the timeline in order and actions by incident.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { up } from '@/infrastructure/persistence/sqlite/migrations/162-create-incidents.js';
import {
  SQLiteIncidentEventRepository,
  SQLiteIncidentRepository,
  SQLiteRuntimeActionRepository,
} from '@/infrastructure/repositories/sqlite-incident.repository.js';
import {
  ActionProposer,
  IncidentEventKind,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  RuntimeActionKind,
  RuntimeActionStatus,
  type Incident,
  type RuntimeAction,
} from '@/domain/generated/output.js';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-01T10:30:00Z');

const INCIDENT: Incident = {
  id: 'inc-1',
  spaceId: 'space-acme',
  title: 'Checkout 5xx',
  severity: IncidentSeverity.Critical,
  status: IncidentStatus.Resolved,
  source: IncidentSource.Alert,
  detail: 'Error rate above 5%',
  url: 'https://grafana.acme.com/d/1',
  externalId: 'alert-9',
  runtimeContext: 'prod',
  runtimeNamespace: 'shop',
  runtimeWorkload: 'checkout',
  signalId: 'sig-1',
  mitigatedAt: T2,
  resolvedAt: T2,
  postmortem: '# Postmortem',
  createdAt: T1,
  updatedAt: T2,
};

const ACTION: RuntimeAction = {
  id: 'act-1',
  incidentId: 'inc-1',
  kind: RuntimeActionKind.Scale,
  replicas: 6,
  status: RuntimeActionStatus.Succeeded,
  proposedBy: ActionProposer.Agent,
  reason: 'CPU saturated',
  output: 'deployment.apps/checkout scaled',
  recovered: true,
  decidedAt: T2,
  executedAt: T2,
  createdAt: T1,
  updatedAt: T2,
};

describe('SQLite incident repositories', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
  });
  afterEach(() => db.close());

  it('is idempotent', async () => {
    await expect(up({ context: db } as never)).resolves.toBeUndefined();
  });

  it('round-trips every incident field and filters by space, status and external id', async () => {
    const incidents = new SQLiteIncidentRepository(db);
    await incidents.create(INCIDENT);
    const open: Incident = {
      id: 'inc-2',
      spaceId: 'space-acme',
      title: 'Slow search',
      severity: IncidentSeverity.Minor,
      status: IncidentStatus.Open,
      source: IncidentSource.Manual,
      createdAt: T2,
      updatedAt: T2,
    };
    await incidents.create(open);
    expect(await incidents.findById('inc-1')).toEqual(INCIDENT);
    expect(await incidents.findById('inc-2')).toEqual(open);
    expect((await incidents.list({ spaceId: 'space-acme' })).map((i) => i.id)).toEqual([
      'inc-2',
      'inc-1',
    ]);
    expect((await incidents.list({ statuses: [IncidentStatus.Open] })).map((i) => i.id)).toEqual([
      'inc-2',
    ]);
    expect(await incidents.findOpenByExternalId('space-acme', 'alert-9')).toBeNull();
    await incidents.update({ ...open, externalId: 'alert-10' });
    expect((await incidents.findOpenByExternalId('space-acme', 'alert-10'))?.id).toBe('inc-2');
  });

  it('keeps the timeline in order and actions by incident', async () => {
    const events = new SQLiteIncidentEventRepository(db);
    await events.append({
      id: 'e2',
      incidentId: 'inc-1',
      kind: IncidentEventKind.Note,
      text: 'b',
      createdAt: T2,
    });
    await events.append({
      id: 'e1',
      incidentId: 'inc-1',
      kind: IncidentEventKind.Opened,
      text: 'a',
      createdAt: T1,
    });
    expect((await events.listByIncident('inc-1')).map((e) => e.id)).toEqual(['e1', 'e2']);

    const actions = new SQLiteRuntimeActionRepository(db);
    await actions.create(ACTION);
    const proposed: RuntimeAction = {
      id: 'act-2',
      incidentId: 'inc-1',
      kind: RuntimeActionKind.Restart,
      status: RuntimeActionStatus.Proposed,
      proposedBy: ActionProposer.Person,
      reason: 'Stuck pods',
      createdAt: T2,
      updatedAt: T2,
    };
    await actions.create(proposed);
    expect(await actions.findById('act-1')).toEqual(ACTION);
    expect((await actions.listByIncident('inc-1')).map((a) => a.id)).toEqual(['act-1', 'act-2']);
    await actions.update({ ...proposed, status: RuntimeActionStatus.Rejected, decidedAt: T2 });
    expect((await actions.findById('act-2'))?.status).toBe(RuntimeActionStatus.Rejected);
  });
});
