import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { ManageSignalsUseCase } from '@/application/use-cases/opportunities/manage-signals.use-case.js';
import { OpportunityStatus, SignalKind, type Opportunity } from '@/domain/generated/output.js';
import { DEFAULT_SPACE } from '../../../../helpers/space-repositories.mock.js';
import { ACME, PAYMENTS, opportunityWorld } from './opportunity.fixtures.js';

const T = new Date('2026-10-05T10:00:00Z');
const BET: Opportunity = {
  id: 'opp-1',
  spaceId: ACME.id,
  title: 'Faster checkout',
  status: OpportunityStatus.Proposed,
  reviewHours: 4,
  confidence: 0.5,
  strategic: false,
  createdAt: T,
  updatedAt: T,
};

describe('ManageSignalsUseCase', () => {
  let world: ReturnType<typeof opportunityWorld>;
  let useCase: ManageSignalsUseCase;

  beforeEach(async () => {
    world = opportunityWorld();
    useCase = new ManageSignalsUseCase(
      world.signals,
      world.opportunities,
      world.spaces,
      world.productLines
    );
    await world.opportunities.create(BET);
  });

  it('records a signal in a space and product line, linked to an opportunity', async () => {
    const result = await useCase.record({
      space: 'acme',
      productLine: 'payments',
      title: '  Guest checkout times out ',
      kind: SignalKind.Feedback,
      customer: 'Globex',
      monthlyRevenue: 4000,
      urgent: true,
      url: 'https://support.acme.com/t/1',
      opportunity: 'opp-1',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.signal).toMatchObject({
      spaceId: ACME.id,
      productLineId: PAYMENTS.id,
      title: 'Guest checkout times out',
      kind: SignalKind.Feedback,
      customer: 'Globex',
      monthlyRevenue: 4000,
      urgent: true,
      opportunityId: 'opp-1',
    });
    expect(world.signals.rows.size).toBe(1);
  });

  it('defaults to a manual, non-urgent signal in the default space', async () => {
    const result = await useCase.record({ title: 'Dark mode' });
    if (!result.ok) throw new Error(result.error);
    expect(result.signal).toMatchObject({
      spaceId: DEFAULT_SPACE.id,
      kind: SignalKind.Manual,
      urgent: false,
    });
    expect(result.signal).not.toHaveProperty('customer');
  });

  it('refuses an empty title, negative revenue, unknown scopes and cross-space links', async () => {
    expect((await useCase.record({ title: ' ' })).ok).toBe(false);
    expect((await useCase.record({ title: 'x', monthlyRevenue: -1 })).ok).toBe(false);
    expect((await useCase.record({ title: 'x', space: 'nope' })).ok).toBe(false);
    expect((await useCase.record({ title: 'x', space: 'acme', productLine: 'nope' })).ok).toBe(
      false
    );
    const crossSpace = await useCase.record({ title: 'x', opportunity: 'opp-1' });
    expect(crossSpace).toEqual({ ok: false, error: 'No opportunity "opp-1" in Default.' });
    expect(world.signals.rows.size).toBe(0);
  });

  it('lists signals of a space, optionally only unlinked ones', async () => {
    await useCase.record({ title: 'linked', space: 'acme', opportunity: 'opp-1' });
    await useCase.record({ title: 'loose', space: 'acme' });
    await useCase.record({ title: 'personal' });
    const all = await useCase.list({ space: 'acme' });
    const loose = await useCase.list({ space: 'acme', unlinked: true });
    if (!all.ok || !loose.ok) throw new Error('list failed');
    expect(all.signals).toHaveLength(2);
    expect(loose.signals.map((s) => s.title)).toEqual(['loose']);
    expect((await useCase.list({ space: 'nope' })).ok).toBe(false);
  });

  it('links and unlinks a signal within its space, and removes it', async () => {
    const recorded = await useCase.record({ title: 'loose', space: 'acme' });
    if (!recorded.ok) throw new Error(recorded.error);
    const linked = await useCase.link(recorded.signal.id, 'opp-1');
    expect(linked.ok && linked.signal.opportunityId).toBe('opp-1');
    const unlinked = await useCase.link(recorded.signal.id, null);
    expect(unlinked.ok && 'opportunityId' in unlinked.signal).toBe(false);

    const personal = await useCase.record({ title: 'personal' });
    if (!personal.ok) throw new Error(personal.error);
    expect((await useCase.link(personal.signal.id, 'opp-1')).ok).toBe(false);

    expect(await useCase.remove(recorded.signal.id)).toEqual({ ok: true });
    expect((await useCase.remove(recorded.signal.id)).ok).toBe(false);
  });
});
