import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { GetOpportunityBoardUseCase } from '@/application/use-cases/opportunities/get-opportunity-board.use-case.js';
import { ManageOpportunityWeightsUseCase } from '@/application/use-cases/opportunities/manage-opportunity-weights.use-case.js';
import { DEFAULT_OPPORTUNITY_WEIGHTS } from '@/domain/shared/opportunity-score.js';
import {
  OpportunityStatus,
  SignalKind,
  type Opportunity,
  type Signal,
} from '@/domain/generated/output.js';
import { ACME, opportunityWorld } from './opportunity.fixtures.js';

const T = new Date('2026-10-05T10:00:00Z');

function bet(id: string, status: OpportunityStatus, reviewHours: number): Opportunity {
  return {
    id,
    spaceId: ACME.id,
    title: id,
    status,
    reviewHours,
    confidence: 1,
    strategic: false,
    createdAt: T,
    updatedAt: T,
  };
}

function signal(id: string, opportunityId?: string, spaceId = ACME.id): Signal {
  return {
    id,
    spaceId,
    kind: SignalKind.Feedback,
    title: id,
    urgent: false,
    ...(opportunityId ? { opportunityId } : {}),
    createdAt: T,
    updatedAt: T,
  };
}

describe('GetOpportunityBoardUseCase and weights', () => {
  let world: ReturnType<typeof opportunityWorld>;
  let board: GetOpportunityBoardUseCase;
  let weights: ManageOpportunityWeightsUseCase;

  beforeEach(async () => {
    world = opportunityWorld();
    board = new GetOpportunityBoardUseCase(
      world.opportunities,
      world.signals,
      world.weights,
      world.spaces,
      world.productLines
    );
    weights = new ManageOpportunityWeightsUseCase(world.weights, world.spaces, world.productLines);
    for (const o of [
      bet('building', OpportunityStatus.Building, 3),
      bet('best', OpportunityStatus.Accepted, 2),
      bet('big', OpportunityStatus.Accepted, 8),
      bet('idea', OpportunityStatus.Proposed, 1),
      bet('dropped', OpportunityStatus.Dropped, 1),
    ]) {
      await world.opportunities.create(o);
    }
    for (const s of [
      signal('a', 'best'),
      signal('b', 'best'),
      signal('c', 'big'),
      signal('loose'),
      signal('elsewhere', undefined, 'other-space'),
    ]) {
      await world.signals.create(s);
    }
  });

  it('ranks open opportunities, draws the line and lists loose signals of the space', async () => {
    await weights.set('acme', { weeklyReviewHours: 6 });
    const result = await board.execute('acme');
    if (!result.ok) throw new Error(result.error);
    const { ranked, line, unlinkedSignals, decided } = result.board;
    expect(ranked.map((s) => s.opportunity.id)).toEqual(['best', 'big', 'idea', 'building']);
    expect(line.inLine.map((s) => s.opportunity.id)).toEqual(['building', 'best']);
    expect(line.waiting.map((s) => s.opportunity.id)).toEqual(['big']);
    expect(unlinkedSignals.map((s) => s.id)).toEqual(['loose']);
    expect(decided.map((o) => o.id)).toEqual(['dropped']);
  });

  it('uses default weights until a space sets its own', async () => {
    const before = await weights.get('acme');
    expect(before.ok && before.isDefault).toBe(true);
    expect(before.ok && before.weights.weeklyReviewHours).toBe(
      DEFAULT_OPPORTUNITY_WEIGHTS.weeklyReviewHours
    );
    const set = await weights.set('acme', { reach: 4 });
    expect(set.ok && set.weights.reach).toBe(4);
    const after = await weights.get('acme');
    expect(after.ok && after.isDefault).toBe(false);
  });

  it('refuses negative weights, no capacity and unknown spaces', async () => {
    expect((await weights.set('acme', { urgency: -1 })).ok).toBe(false);
    expect((await weights.set('acme', { weeklyReviewHours: 0 })).ok).toBe(false);
    expect((await weights.set('nope', { reach: 1 })).ok).toBe(false);
    expect((await board.execute('nope')).ok).toBe(false);
  });
});
