/**
 * Incident loop (spec 129), end to end through a real DI container and
 * SQLite with a scripted agent and a fake runtime: an alert opens an
 * incident, triage proposes a rollback the space must approve, approval runs
 * it, recovery mitigates the incident, and resolving writes the postmortem.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { container as rootContainer, type DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { fakeRuntime } from '../../../../helpers/incident-repositories.mock.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { registerRepositories } from '@/infrastructure/di/modules/register-repositories.js';
import { registerSpaces } from '@/infrastructure/di/modules/register-spaces.js';
import { registerOpportunities } from '@/infrastructure/di/modules/register-opportunities.js';
import { registerFeedback } from '@/infrastructure/di/modules/register-feedback.js';
import { registerIncidents } from '@/infrastructure/di/modules/register-incidents.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { ConfigureSpaceAgentUseCase } from '@/application/use-cases/spaces/configure-space-agent.use-case.js';
import { ManageFeedbackKeysUseCase } from '@/application/use-cases/feedback/manage-feedback-keys.use-case.js';
import { IngestAlertUseCase } from '@/application/use-cases/incidents/ingest-alert.use-case.js';
import { TriageIncidentUseCase } from '@/application/use-cases/incidents/triage-incident.use-case.js';
import { RuntimeActionsUseCase } from '@/application/use-cases/incidents/runtime-actions.use-case.js';
import { ManageIncidentsUseCase } from '@/application/use-cases/incidents/manage-incidents.use-case.js';
import { GetOpportunityBoardUseCase } from '@/application/use-cases/opportunities/get-opportunity-board.use-case.js';
import {
  IncidentStatus,
  RuntimeActionKind,
  RuntimeActionStatus,
  SignalKind,
} from '@/domain/generated/output.js';

describe('Incident loop (integration)', () => {
  let db: Database.Database;
  let c: DependencyContainer;
  const runtime = fakeRuntime();
  const call = vi.fn();

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    c = rootContainer.createChildContainer();
    c.registerInstance<Database.Database>('Database', db);
    registerRepositories(c);
    registerSpaces(c);
    registerOpportunities(c);
    registerFeedback(c);
    registerIncidents(c);
    c.register('IRuntimeController', { useValue: runtime });
    c.register('IStructuredAgentCaller', { useValue: { call } });
    expect((await c.resolve(ManageSpacesUseCase).create({ name: 'Acme' })).ok).toBe(true);
    await c
      .resolve(ConfigureSpaceAgentUseCase)
      .configure('acme', { autoRuntimeActions: [RuntimeActionKind.Restart] });
  });

  afterEach(() => {
    c.dispose();
    db.close();
    vi.clearAllMocks();
  });

  it('runs from alert to postmortem', async () => {
    const key = await c
      .resolve(ManageFeedbackKeysUseCase)
      .create({ space: 'acme', name: 'Alertmanager' });
    if (!key.ok) throw new Error(key.error);
    const alert = await c.resolve(IngestAlertUseCase).execute(key.secret, {
      title: 'CheckoutErrorRate',
      severity: 'Critical',
      namespace: 'shop',
      workload: 'checkout',
      externalId: 'fp-1',
    });
    if (!alert.ok) throw new Error(alert.error);
    const id = alert.incident.id;

    const board = await c.resolve(GetOpportunityBoardUseCase).execute('acme');
    expect(board.ok && board.board.unlinkedSignals[0]).toMatchObject({
      kind: SignalKind.Incident,
      urgent: true,
    });

    call.mockResolvedValue({
      summary: 'OOM since the last deploy',
      hypotheses: [{ cause: 'Memory regression', confidence: 'High', evidence: 'OOMKilled' }],
      action: { kind: 'Rollback', reason: 'Last deploy raised memory' },
    });
    const triage = await c.resolve(TriageIncidentUseCase).execute(id);
    if (!triage.ok) throw new Error(triage.error);
    expect(triage.action?.status).toBe(RuntimeActionStatus.Proposed);
    expect(runtime.rollback).not.toHaveBeenCalled();

    const approved = await c.resolve(RuntimeActionsUseCase).approve(triage.action?.id ?? '');
    expect(approved.ok && approved.action.recovered).toBe(true);

    const manage = c.resolve(ManageIncidentsUseCase);
    const shown = await manage.get(id);
    expect(shown.ok && shown.detail.incident.status).toBe(IncidentStatus.Mitigated);

    const resolved = await manage.resolve(id);
    if (!resolved.ok) throw new Error(resolved.error);
    expect(resolved.incident.postmortem).toContain('rollback (Agent): Succeeded, recovered');
    expect(resolved.incident.postmortem).toContain('Memory regression');
  });
});
