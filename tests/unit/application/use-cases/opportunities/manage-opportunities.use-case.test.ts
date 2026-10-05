import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { ManageOpportunitiesUseCase } from '@/application/use-cases/opportunities/manage-opportunities.use-case.js';
import { OpportunitySource, OpportunityStatus, SignalKind } from '@/domain/generated/output.js';
import { ACME, PAYMENTS, opportunityWorld } from './opportunity.fixtures.js';

const T = new Date('2026-10-05T10:00:00Z');

describe('ManageOpportunitiesUseCase', () => {
  let world: ReturnType<typeof opportunityWorld>;
  let useCase: ManageOpportunitiesUseCase;

  beforeEach(() => {
    world = opportunityWorld();
    useCase = new ManageOpportunitiesUseCase(
      world.opportunities,
      world.signals,
      world.weights,
      world.spaces,
      world.productLines
    );
  });

  async function create() {
    const result = await useCase.create({
      space: 'acme',
      productLine: 'payments',
      title: 'Faster guest checkout',
      problem: 'Guests abandon checkout when it times out.',
      reviewHours: 6,
      confidence: 0.7,
      strategic: true,
    });
    if (!result.ok) throw new Error(result.error);
    return result.opportunity;
  }

  it('creates a proposed opportunity in a space and product line', async () => {
    const opportunity = await create();
    expect(opportunity).toMatchObject({
      spaceId: ACME.id,
      productLineId: PAYMENTS.id,
      status: OpportunityStatus.Proposed,
      reviewHours: 6,
      confidence: 0.7,
      strategic: true,
    });
  });

  it('refuses bad estimates', async () => {
    for (const bad of [
      { title: '', reviewHours: 2 },
      { title: 'x', reviewHours: 0 },
      { title: 'x', reviewHours: 500 },
      { title: 'x', reviewHours: 2, confidence: 1.5 },
    ]) {
      expect((await useCase.create(bad)).ok).toBe(false);
    }
    expect(world.opportunities.rows.size).toBe(0);
  });

  it('re-estimates an opportunity', async () => {
    const opportunity = await create();
    const result = await useCase.estimate(opportunity.id, { reviewHours: 3, confidence: 0.9 });
    expect(result.ok && result.opportunity).toMatchObject({ reviewHours: 3, confidence: 0.9 });
    expect((await useCase.estimate(opportunity.id, { confidence: -1 })).ok).toBe(false);
  });

  it('accepts, drops with a reason and accepts again', async () => {
    const opportunity = await create();
    const accepted = await useCase.accept(opportunity.id);
    expect(accepted.ok && accepted.opportunity.status).toBe(OpportunityStatus.Accepted);
    expect((await useCase.accept(opportunity.id)).ok).toBe(false);

    expect((await useCase.drop(opportunity.id, ' ')).ok).toBe(false);
    const dropped = await useCase.drop(opportunity.id, 'Covered by the new PSP');
    expect(dropped.ok && dropped.opportunity).toMatchObject({
      status: OpportunityStatus.Dropped,
      dropReason: 'Covered by the new PSP',
    });

    const again = await useCase.accept(opportunity.id);
    expect(again.ok && again.opportunity.status).toBe(OpportunityStatus.Accepted);
    expect(again.ok && 'dropReason' in again.opportunity).toBe(false);
  });

  it('shows an opportunity with its signals and score under the space weights', async () => {
    const opportunity = await create();
    await world.signals.create({
      id: 's1',
      spaceId: ACME.id,
      kind: SignalKind.Feedback,
      title: 'Timeout',
      customer: 'Globex',
      monthlyRevenue: 3000,
      urgent: true,
      opportunityId: opportunity.id,
      createdAt: T,
      updatedAt: T,
    });
    await world.weights.save({
      spaceId: ACME.id,
      reach: 1,
      revenue: 2,
      urgency: 3,
      strategic: 5,
      weeklyReviewHours: 10,
    });
    const shown = await useCase.show(opportunity.id);
    if (!shown.ok) throw new Error(shown.error);
    expect(shown.detail.signals).toHaveLength(1);
    expect(shown.detail.value).toBe(15);
    expect(shown.detail.score).toBeCloseTo((15 * 0.7) / 6);
    expect((await useCase.show('nope')).ok).toBe(false);
  });

  it('records how an opportunity came to be, Manual unless told otherwise', async () => {
    const manual = await create();
    expect(manual.source).toBe(OpportunitySource.Manual);
    const discovered = await useCase.create({
      space: 'acme',
      title: 'Cache sessions',
      reviewHours: 3,
      source: OpportunitySource.Discovery,
      brief: 'Cache the session lookup.',
    });
    expect(discovered.ok && discovered.opportunity).toMatchObject({
      source: OpportunitySource.Discovery,
      brief: 'Cache the session lookup.',
    });
  });
});
