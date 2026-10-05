import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import {
  OpportunityStatus,
  OutcomeVerdict,
  RuntimeActionStatus,
} from '@/domain/generated/output.js';
import { GetFactoryStatusUseCase } from '@/application/use-cases/autopilot/get-factory-status.use-case.js';

const SPACE = { id: 'space-acme', name: 'Acme', slug: 'acme' };

function useCase(boardOk = true) {
  const board = {
    execute: vi.fn(async () =>
      boardOk
        ? {
            ok: true,
            board: {
              space: SPACE,
              ranked: [
                { opportunity: { status: OpportunityStatus.Building } },
                { opportunity: { status: OpportunityStatus.Accepted } },
              ],
              line: { inLine: [{}, {}], waiting: [{}], usedHours: 12, capacityHours: 16 },
            },
          }
        : { ok: false, error: 'No space "x".' }
    ),
  };
  const incidents = { list: vi.fn(async () => [{ id: 'inc-1' }, { id: 'inc-2' }]) };
  const actions = {
    listByIncident: vi.fn(async (id: string) =>
      id === 'inc-1'
        ? [{ status: RuntimeActionStatus.Proposed }, { status: RuntimeActionStatus.Succeeded }]
        : []
    ),
  };
  const outcomes = {
    list: vi.fn(async () => ({
      ok: true,
      outcomes: [
        { outcome: { verdict: OutcomeVerdict.Pending }, customers: [{}, {}] },
        { outcome: { verdict: OutcomeVerdict.Solved }, customers: [] },
      ],
    })),
  };
  const autopilot = {
    get: vi.fn(async () => ({
      ok: true,
      policy: { fillLine: true },
      isDefault: false,
      runs: [{ id: 'run-2' }, { id: 'run-1' }],
    })),
  };
  return {
    incidents,
    status: new GetFactoryStatusUseCase(
      board as never,
      incidents as never,
      actions as never,
      outcomes as never,
      autopilot as never
    ),
  };
}

describe('GetFactoryStatusUseCase (spec 132)', () => {
  it('gathers the line, building work, incidents, outcomes and autopilot of a space', async () => {
    const { status, incidents } = useCase();
    const result = await status.execute('acme');
    if (!result.ok) throw new Error(result.error);
    expect(incidents.list).toHaveBeenCalledWith({ space: SPACE.id, open: true });
    expect(result.status).toEqual({
      space: SPACE,
      line: { usedHours: 12, capacityHours: 16, inLine: 2, waiting: 1 },
      building: 1,
      openIncidents: 2,
      actionsAwaitingApproval: 1,
      pendingOutcomes: 1,
      customersToTell: 2,
      autopilot: { policy: { fillLine: true }, isDefault: false, lastRun: { id: 'run-2' } },
    });
  });

  it('passes on an unknown space', async () => {
    expect((await useCase(false).status.execute('x')).ok).toBe(false);
  });
});
