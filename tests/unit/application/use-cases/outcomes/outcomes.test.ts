import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  OpportunityStatus,
  OutcomeVerdict,
  SignalKind,
  StateGroup,
  type Opportunity,
  type Signal,
} from '@/domain/generated/output.js';
import { TrackOutcomesUseCase } from '@/application/use-cases/outcomes/track-outcomes.use-case.js';
import { ManageOutcomesUseCase } from '@/application/use-cases/outcomes/manage-outcomes.use-case.js';
import { OUTCOME_WINDOW_DAYS } from '@/domain/shared/outcomes.js';
import { ACME, opportunityWorld } from '../opportunities/opportunity.fixtures.js';
import { InMemoryOutcomes, workItemsIn } from '../../../../helpers/outcome-repositories.mock.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-01T00:00:00Z');
const later = (days: number) => new Date(NOW.getTime() + days * DAY);

function bet(id: string, status: OpportunityStatus, extra: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    spaceId: ACME.id,
    title: 'Faster guest checkout',
    problem: 'Guest checkout times out on mobile',
    status,
    reviewHours: 6,
    confidence: 0.7,
    strategic: false,
    createdAt: later(-30),
    updatedAt: later(-30),
    ...extra,
  };
}

function report(id: string, days: number, extra: Partial<Signal> = {}): Signal {
  return {
    id,
    spaceId: ACME.id,
    kind: SignalKind.Feedback,
    title: 'Guest checkout times out on mobile',
    urgent: false,
    createdAt: later(days),
    updatedAt: later(days),
    ...extra,
  };
}

describe('Outcomes (spec 130)', () => {
  let world: ReturnType<typeof opportunityWorld>;
  let outcomes: InMemoryOutcomes;
  let track: TrackOutcomesUseCase;
  let manage: ManageOutcomesUseCase;

  beforeEach(async () => {
    world = opportunityWorld();
    outcomes = new InMemoryOutcomes();
    const { workItems, states } = workItemsIn({
      'wi-done': StateGroup.Completed,
      'wi-cancelled': StateGroup.Cancelled,
      'wi-started': StateGroup.Started,
    });
    track = new TrackOutcomesUseCase(
      world.opportunities,
      workItems,
      states,
      outcomes,
      world.signals
    );
    manage = new ManageOutcomesUseCase(
      world.opportunities,
      outcomes,
      world.signals,
      world.spaces,
      world.productLines
    );
    for (const opportunity of [
      bet('opp-done', OpportunityStatus.Building, { workItemId: 'wi-done' }),
      bet('opp-cancelled', OpportunityStatus.Building, { workItemId: 'wi-cancelled' }),
      bet('opp-started', OpportunityStatus.Building, { workItemId: 'wi-started' }),
      bet('opp-accepted', OpportunityStatus.Accepted),
    ]) {
      await world.opportunities.create(opportunity);
    }
  });

  it('ships an opportunity once its work item is Completed and reopens a cancelled one', async () => {
    const sweep = await track.run(NOW);
    expect(sweep.shipped.map((o) => o.id)).toEqual(['opp-done']);
    expect(sweep.reopened.map((o) => o.id)).toEqual(['opp-cancelled']);
    expect(await world.opportunities.findById('opp-done')).toMatchObject({
      status: OpportunityStatus.Shipped,
      shippedAt: NOW,
    });
    const reopened = await world.opportunities.findById('opp-cancelled');
    expect(reopened?.status).toBe(OpportunityStatus.Accepted);
    expect(reopened?.workItemId).toBeUndefined();
    expect((await world.opportunities.findById('opp-started'))?.status).toBe(
      OpportunityStatus.Building
    );
    expect(await outcomes.findByOpportunity('opp-done')).toMatchObject({
      verdict: OutcomeVerdict.Pending,
      reviewAt: later(OUTCOME_WINDOW_DAYS),
    });

    const again = await track.run(later(1));
    expect(again.shipped).toEqual([]);
    expect(outcomes.rows.size).toBe(1);
  });

  it('judges an outcome only after its window, from similar reports', async () => {
    await world.signals.create(report('b1', -2, { opportunityId: 'opp-done', customer: 'Globex' }));
    await world.signals.create(report('b2', -5));
    await world.signals.create(report('a1', 3));
    await track.run(NOW);

    expect((await track.run(later(OUTCOME_WINDOW_DAYS - 1))).judged).toEqual([]);
    const { judged } = await track.run(later(OUTCOME_WINDOW_DAYS));
    expect(judged).toHaveLength(1);
    expect(judged[0]).toMatchObject({
      verdict: OutcomeVerdict.Solved,
      signalsBefore: 2,
      signalsAfter: 1,
      judgedAt: later(OUTCOME_WINDOW_DAYS),
    });
  });

  it('ships by hand, refusing what is dropped or already shipped', async () => {
    const shipped = await manage.ship('opp-accepted', NOW);
    if (!shipped.ok) throw new Error(shipped.error);
    expect(shipped.outcome.verdict).toBe(OutcomeVerdict.Pending);
    expect((await manage.ship('opp-accepted')).ok).toBe(false);
    await world.opportunities.create(bet('opp-dropped', OpportunityStatus.Dropped));
    expect((await manage.ship('opp-dropped')).ok).toBe(false);
  });

  it('tells untold customers once and records actual hours', async () => {
    await world.signals.create(
      report('s1', -1, { opportunityId: 'opp-done', customer: 'Globex', url: 'https://t/1' })
    );
    await world.signals.create(report('s2', -1, { opportunityId: 'opp-done' }));
    await track.run(NOW);

    const shown = await manage.show('opp-done');
    if (!shown.ok) throw new Error(shown.error);
    expect(shown.view.customers).toEqual([
      { customer: 'Globex', signalIds: ['s1'], urls: ['https://t/1'] },
    ]);

    const told = await manage.tell('opp-done', later(1));
    if (!told.ok) throw new Error(told.error);
    expect(told.customers.map((c) => c.customer)).toEqual(['Globex']);
    expect((await world.signals.findById('s1'))?.toldAt).toEqual(later(1));
    expect((await world.signals.findById('s2'))?.toldAt).toBeUndefined();
    const second = await manage.tell('opp-done');
    expect(second.ok && second.customers).toEqual([]);

    expect((await manage.recordHours('opp-done', 0)).ok).toBe(false);
    const timed = await manage.recordHours('opp-done', 9);
    expect(timed.ok && timed.outcome.actualReviewHours).toBe(9);
    expect((await manage.recordHours('opp-accepted', 3)).ok).toBe(false);
  });

  it("lists a space's outcomes with its calibration", async () => {
    await track.run(NOW);
    await manage.recordHours('opp-done', 9);
    const listed = await manage.list('acme');
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.outcomes.map((v) => v.opportunity.id)).toEqual(['opp-done']);
    expect(listed.calibration).toEqual({ judged: 0, solved: 0, timed: 1, hoursRatio: 1.5 });
  });
});
