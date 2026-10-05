/**
 * Outcome loop (spec 130), end to end through a real DI container and SQLite:
 * an opportunity built into a work item ships when the work item reaches a
 * Completed state, its customer is told, and its outcome is judged after the
 * window.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { container as rootContainer, type DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { registerRepositories } from '@/infrastructure/di/modules/register-repositories.js';
import { registerSpaces } from '@/infrastructure/di/modules/register-spaces.js';
import { registerOpportunities } from '@/infrastructure/di/modules/register-opportunities.js';
import { registerOutcomes } from '@/infrastructure/di/modules/register-outcomes.js';
import { CreatePmProjectUseCase } from '@/application/use-cases/pm-projects/create-pm-project.use-case.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { ManageSignalsUseCase } from '@/application/use-cases/opportunities/manage-signals.use-case.js';
import { ManageOpportunitiesUseCase } from '@/application/use-cases/opportunities/manage-opportunities.use-case.js';
import { BuildOpportunityUseCase } from '@/application/use-cases/opportunities/build-opportunity.use-case.js';
import { TrackOutcomesUseCase } from '@/application/use-cases/outcomes/track-outcomes.use-case.js';
import { ManageOutcomesUseCase } from '@/application/use-cases/outcomes/manage-outcomes.use-case.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '@/application/ports/output/repositories/work-item-state-repository.interface.js';
import {
  OpportunityStatus,
  OutcomeVerdict,
  SignalKind,
  StateGroup,
} from '@/domain/generated/output.js';
import { OUTCOME_WINDOW_DAYS } from '@/domain/shared/outcomes.js';

const DAY = 24 * 60 * 60 * 1000;

describe('Outcome loop (integration)', () => {
  let db: Database.Database;
  let c: DependencyContainer;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    c = rootContainer.createChildContainer();
    c.registerInstance<Database.Database>('Database', db);
    registerRepositories(c);
    registerSpaces(c);
    registerOpportunities(c);
    registerOutcomes(c);
    expect((await c.resolve(ManageSpacesUseCase).create({ name: 'Acme' })).ok).toBe(true);
  });

  afterEach(() => {
    c.dispose();
    db.close();
  });

  it('ships a built opportunity when its work item is done, then tells and judges', async () => {
    const created = await c.resolve(ManageOpportunitiesUseCase).create({
      space: 'acme',
      title: 'Faster guest checkout',
      problem: 'Guest checkout times out on mobile.',
      reviewHours: 4,
      confidence: 0.75,
    });
    if (!created.ok) throw new Error(created.error);
    const id = created.opportunity.id;
    const recorded = await c.resolve(ManageSignalsUseCase).record({
      space: 'acme',
      kind: SignalKind.Feedback,
      title: 'Globex: guest checkout times out on mobile',
      customer: 'Globex',
      url: 'https://support.acme.com/t/1',
      opportunity: id,
    });
    expect(recorded.ok).toBe(true);

    const project = await c
      .resolve(CreatePmProjectUseCase)
      .execute({ name: 'Payments', identifierPrefix: 'PAY' });
    if (!project.ok) throw new Error(project.error);
    const built = await c.resolve(BuildOpportunityUseCase).execute(id, project.project.id);
    if (!built.ok) throw new Error(built.error);

    const track = c.resolve(TrackOutcomesUseCase);
    expect((await track.run()).shipped).toEqual([]);

    const states = await c
      .resolve<IWorkItemStateRepository>('IWorkItemStateRepository')
      .listByProject(project.project.id);
    const done = states.find((state) => state.stateGroup === StateGroup.Completed);
    if (!done) throw new Error('no Completed state');
    await c
      .resolve<IWorkItemRepository>('IWorkItemRepository')
      .update(built.workItem.id, { stateId: done.id });

    const shippedAt = new Date();
    const sweep = await track.run(shippedAt);
    expect(sweep.shipped.map((o) => o.id)).toEqual([id]);

    const outcomes = c.resolve(ManageOutcomesUseCase);
    const listed = await outcomes.list('acme');
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.outcomes[0].opportunity.status).toBe(OpportunityStatus.Shipped);
    expect(listed.outcomes[0].customers.map((t) => t.customer)).toEqual(['Globex']);

    const told = await outcomes.tell(id);
    expect(told.ok && told.customers.length).toBe(1);
    const again = await outcomes.show(id);
    expect(again.ok && again.view.customers).toEqual([]);

    const judged = await track.run(new Date(shippedAt.getTime() + OUTCOME_WINDOW_DAYS * DAY));
    expect(judged.judged[0]).toMatchObject({
      verdict: OutcomeVerdict.Solved,
      signalsBefore: 1,
      signalsAfter: 0,
    });
  });
});
