import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BuildOpportunityUseCase } from '@/application/use-cases/opportunities/build-opportunity.use-case.js';
import type { CreateWorkItemUseCase } from '@/application/use-cases/work-items/create-work-item.use-case.js';
import type { IPmProjectRepository } from '@/application/ports/output/repositories/pm-project-repository.interface.js';
import { OpportunityStatus, SignalKind, type Opportunity } from '@/domain/generated/output.js';
import { ACME, opportunityWorld } from './opportunity.fixtures.js';

const T = new Date('2026-10-05T10:00:00Z');
const BET: Opportunity = {
  id: 'opp-1',
  spaceId: ACME.id,
  title: 'Faster guest checkout',
  problem: 'Guests abandon checkout when it times out.',
  status: OpportunityStatus.Accepted,
  reviewHours: 6,
  confidence: 0.7,
  strategic: false,
  createdAt: T,
  updatedAt: T,
};

describe('BuildOpportunityUseCase', () => {
  let world: ReturnType<typeof opportunityWorld>;
  let createWorkItem: { execute: ReturnType<typeof vi.fn> };
  let useCase: BuildOpportunityUseCase;

  beforeEach(async () => {
    world = opportunityWorld();
    createWorkItem = {
      execute: vi.fn(async () => ({ ok: true, workItem: { id: 'wi-1', title: BET.title } })),
    };
    const projects = {
      findById: vi.fn(async (id: string) => (id === 'p1' ? { id: 'p1' } : null)),
      findBySlug: vi.fn(async (slug: string) => (slug === 'pay' ? { id: 'p1' } : null)),
    } as unknown as IPmProjectRepository;
    useCase = new BuildOpportunityUseCase(
      world.opportunities,
      world.signals,
      projects,
      createWorkItem as unknown as CreateWorkItemUseCase
    );
    await world.opportunities.create(BET);
    await world.signals.create({
      id: 's1',
      spaceId: ACME.id,
      kind: SignalKind.Feedback,
      title: 'Checkout times out',
      customer: 'Globex',
      monthlyRevenue: 4000,
      urgent: true,
      url: 'https://support.acme.com/t/1',
      opportunityId: BET.id,
      createdAt: T,
      updatedAt: T,
    });
  });

  it('creates one work item with the problem and evidence, and starts building', async () => {
    const result = await useCase.execute('opp-1', 'pay');
    if (!result.ok) throw new Error(result.error);
    expect(createWorkItem.execute).toHaveBeenCalledTimes(1);
    const input = createWorkItem.execute.mock.calls[0][0];
    expect(input).toMatchObject({ projectId: 'p1', title: 'Faster guest checkout' });
    expect(input.description).toContain('Guests abandon checkout');
    expect(input.description).toContain('Revenue at stake: 4000/month');
    expect(input.description).toContain('Checkout times out (https://support.acme.com/t/1)');
    expect(result.opportunity).toMatchObject({
      status: OpportunityStatus.Building,
      workItemId: 'wi-1',
    });
    expect((await world.opportunities.findById('opp-1'))?.status).toBe(OpportunityStatus.Building);
  });

  it('refuses to build twice, dropped bets and unknown projects', async () => {
    expect((await useCase.execute('opp-1', 'nope')).ok).toBe(false);
    await useCase.execute('opp-1', 'pay');
    expect((await useCase.execute('opp-1', 'pay')).ok).toBe(false);
    await world.opportunities.update({ ...BET, id: 'opp-2', status: OpportunityStatus.Dropped });
    expect((await useCase.execute('opp-2', 'pay')).ok).toBe(false);
    expect(createWorkItem.execute).toHaveBeenCalledTimes(1);
  });

  it('passes a work item refusal through and leaves the opportunity as it was', async () => {
    createWorkItem.execute.mockResolvedValueOnce({
      ok: false,
      error: 'Project has no workflow states configured.',
    });
    const result = await useCase.execute('opp-1', 'p1');
    expect(result).toEqual({ ok: false, error: 'Project has no workflow states configured.' });
    expect((await world.opportunities.findById('opp-1'))?.status).toBe(OpportunityStatus.Accepted);
  });
});
