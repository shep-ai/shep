import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { IncidentSeverity } from '@/domain/generated/output.js';
import { GetIncidentBoardUseCase } from '@/application/use-cases/incidents/get-incident-board.use-case.js';
import { ACME } from '../opportunities/opportunity.fixtures.js';
import { incidentWorld } from './incident.fixtures.js';

describe('GetIncidentBoardUseCase (spec 129)', () => {
  let world: ReturnType<typeof incidentWorld>;
  let board: GetIncidentBoardUseCase;

  beforeEach(() => {
    world = incidentWorld();
    board = new GetIncidentBoardUseCase(world.spaces, world.productLines, world.manage);
  });

  async function open(title: string) {
    const result = await world.open.execute({
      space: 'acme',
      title,
      severity: IncidentSeverity.Major,
      workload: 'checkout',
    });
    if (!result.ok) throw new Error(result.error);
    return result.incident;
  }

  it('shows the space by slug with the first unresolved incident selected', async () => {
    const old = await open('Old outage');
    await world.manage.resolve(old.id, 'done');
    const live = await open('Checkout 5xx');

    const result = await board.execute({ space: 'acme' });
    if (!result.ok) throw new Error(result.error);
    expect(result.board.space.id).toBe(ACME.id);
    expect(result.board.incidents.map((i) => i.id).sort()).toEqual([old.id, live.id].sort());
    expect(result.board.selected?.incident.id).toBe(live.id);
  });

  it('selects the requested incident of the space, with its timeline', async () => {
    const first = await open('First');
    await open('Second');
    const result = await board.execute({ space: 'acme', incident: first.id });
    if (!result.ok) throw new Error(result.error);
    expect(result.board.selected?.incident.id).toBe(first.id);
    expect(result.board.selected?.events.length).toBeGreaterThan(0);
  });

  it('ignores a requested incident from another space and selects nothing in an empty space', async () => {
    const result = await board.execute({ space: 'acme', incident: 'inc-elsewhere' });
    if (!result.ok) throw new Error(result.error);
    expect(result.board.incidents).toEqual([]);
    expect(result.board.selected).toBeUndefined();
  });

  it('refuses an unknown space', async () => {
    const result = await board.execute({ space: 'nowhere' });
    expect(result.ok).toBe(false);
  });
});
