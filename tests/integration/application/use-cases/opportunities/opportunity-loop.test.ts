/**
 * Opportunity loop (spec 126), end to end through a real DI container and
 * SQLite: signals in two spaces, an opportunity backed by one space's
 * signals, the board's ranking and line, and building it into a work item.
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
import { CreatePmProjectUseCase } from '@/application/use-cases/pm-projects/create-pm-project.use-case.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { ManageSignalsUseCase } from '@/application/use-cases/opportunities/manage-signals.use-case.js';
import { ManageOpportunitiesUseCase } from '@/application/use-cases/opportunities/manage-opportunities.use-case.js';
import { GetOpportunityBoardUseCase } from '@/application/use-cases/opportunities/get-opportunity-board.use-case.js';
import { ManageOpportunityWeightsUseCase } from '@/application/use-cases/opportunities/manage-opportunity-weights.use-case.js';
import { BuildOpportunityUseCase } from '@/application/use-cases/opportunities/build-opportunity.use-case.js';
import type { IWorkItemRepository } from '@/application/ports/output/repositories/work-item-repository.interface.js';
import { OpportunityStatus, SignalKind } from '@/domain/generated/output.js';

describe('Opportunity loop (integration)', () => {
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
    expect((await c.resolve(ManageSpacesUseCase).create({ name: 'Acme' })).ok).toBe(true);
  });

  afterEach(() => {
    c.dispose();
    db.close();
  });

  it('turns evidence into a ranked bet and builds it into a work item', async () => {
    const signals = c.resolve(ManageSignalsUseCase);
    const opportunities = c.resolve(ManageOpportunitiesUseCase);

    const created = await opportunities.create({
      space: 'acme',
      title: 'Faster guest checkout',
      problem: 'Guests abandon checkout when it times out.',
      reviewHours: 4,
      confidence: 0.75,
    });
    if (!created.ok) throw new Error(created.error);
    const id = created.opportunity.id;

    for (const customer of ['Globex', 'Initech']) {
      const recorded = await signals.record({
        space: 'acme',
        kind: SignalKind.Feedback,
        title: `${customer}: checkout times out`,
        customer,
        monthlyRevenue: 2000,
        opportunity: id,
      });
      expect(recorded.ok).toBe(true);
    }
    expect((await signals.record({ title: 'Personal idea', opportunity: id })).ok).toBe(false);
    expect((await signals.record({ space: 'acme', title: 'Dark mode' })).ok).toBe(true);

    await c.resolve(ManageOpportunityWeightsUseCase).set('acme', { weeklyReviewHours: 5 });
    expect((await opportunities.accept(id)).ok).toBe(true);

    const board = await c.resolve(GetOpportunityBoardUseCase).execute('acme');
    if (!board.ok) throw new Error(board.error);
    const [top] = board.board.ranked;
    expect(top.opportunity.id).toBe(id);
    expect(top.evidence).toEqual({
      signals: 2,
      customers: 2,
      revenueAtStake: 4000,
      urgentSignals: 0,
    });
    expect(board.board.line.inLine.map((s) => s.opportunity.id)).toEqual([id]);
    expect(board.board.unlinkedSignals.map((s) => s.title)).toEqual(['Dark mode']);

    const project = await c
      .resolve(CreatePmProjectUseCase)
      .execute({ name: 'Payments', identifierPrefix: 'PAY' });
    if (!project.ok) throw new Error(project.error);
    const built = await c.resolve(BuildOpportunityUseCase).execute(id, project.project.id);
    if (!built.ok) throw new Error(built.error);

    const workItem = await c
      .resolve<IWorkItemRepository>('IWorkItemRepository')
      .findById(built.workItem.id);
    expect(workItem?.title).toBe('Faster guest checkout');
    expect(workItem?.description).toContain('Globex: checkout times out');
    const shown = await opportunities.show(id);
    expect(shown.ok && shown.detail.opportunity.status).toBe(OpportunityStatus.Building);
  });
});
