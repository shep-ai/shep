import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ActionProposer,
  IncidentEventKind,
  IncidentStatus,
  RuntimeActionKind,
  RuntimeActionStatus,
} from '@/domain/generated/output.js';
import { ACME } from '../opportunities/opportunity.fixtures.js';
import { incidentWorld } from './incident.fixtures.js';

describe('RuntimeActionsUseCase', () => {
  let world: ReturnType<typeof incidentWorld>;
  let incidentId: string;

  beforeEach(async () => {
    world = incidentWorld();
    const opened = await world.open.execute({
      space: 'acme',
      title: 'Checkout 5xx',
      namespace: 'shop',
      workload: 'checkout',
    });
    if (!opened.ok) throw new Error(opened.error);
    incidentId = opened.incident.id;
  });

  const kinds = () => world.events.rows.map((e) => e.kind);

  it('waits for approval when the space does not allow the kind, then runs and verifies', async () => {
    const proposed = await world.runtimeActions.propose(
      incidentId,
      { kind: RuntimeActionKind.Rollback, reason: 'bad deploy' },
      ActionProposer.Agent
    );
    if (!proposed.ok) throw new Error(proposed.error);
    expect(proposed.action.status).toBe(RuntimeActionStatus.Proposed);
    expect(world.runtime.rollback).not.toHaveBeenCalled();

    const approved = await world.runtimeActions.approve(proposed.action.id);
    if (!approved.ok) throw new Error(approved.error);
    expect(approved.action).toMatchObject({
      status: RuntimeActionStatus.Succeeded,
      recovered: true,
    });
    expect(world.runtime.rollback).toHaveBeenCalledWith({
      namespace: 'shop',
      workload: 'checkout',
    });
    expect((await world.incidents.findById(incidentId))?.status).toBe(IncidentStatus.Mitigated);
    expect(kinds()).toEqual([
      IncidentEventKind.Opened,
      IncidentEventKind.ActionProposed,
      IncidentEventKind.ActionApproved,
      IncidentEventKind.ActionSucceeded,
      IncidentEventKind.Recovered,
    ]);
    expect((await world.runtimeActions.approve(proposed.action.id)).ok).toBe(false);
  });

  it('runs at once what the space allows, or what a person proposes', async () => {
    ACME.agentSettings = { autoRuntimeActions: [RuntimeActionKind.Restart] };
    try {
      const auto = await world.runtimeActions.propose(
        incidentId,
        { kind: RuntimeActionKind.Restart, reason: 'stuck pods' },
        ActionProposer.Agent
      );
      expect(auto.ok && auto.action.status).toBe(RuntimeActionStatus.Succeeded);
    } finally {
      delete ACME.agentSettings;
    }
    const byPerson = await world.runtimeActions.propose(
      incidentId,
      { kind: RuntimeActionKind.Scale, replicas: 6, reason: 'cpu' },
      ActionProposer.Person
    );
    expect(byPerson.ok && byPerson.action.status).toBe(RuntimeActionStatus.Succeeded);
    expect(world.runtime.scale).toHaveBeenCalledWith(
      { namespace: 'shop', workload: 'checkout' },
      6
    );
  });

  it('never runs a rejected action', async () => {
    const proposed = await world.runtimeActions.propose(
      incidentId,
      { kind: RuntimeActionKind.Rollback, reason: 'x' },
      ActionProposer.Agent
    );
    if (!proposed.ok) throw new Error(proposed.error);
    const rejected = await world.runtimeActions.reject(proposed.action.id, 'Deploy is fine');
    expect(rejected.ok && rejected.action.status).toBe(RuntimeActionStatus.Rejected);
    expect((await world.runtimeActions.approve(proposed.action.id)).ok).toBe(false);
    expect(world.runtime.rollback).not.toHaveBeenCalled();
    expect(kinds()).toContain(IncidentEventKind.ActionRejected);
  });

  it('records a failing command and a workload that does not recover', async () => {
    world.runtime.restart.mockRejectedValueOnce(new Error('forbidden'));
    const failed = await world.runtimeActions.propose(
      incidentId,
      { kind: RuntimeActionKind.Restart, reason: 'x' },
      ActionProposer.Person
    );
    expect(failed.ok && failed.action).toMatchObject({
      status: RuntimeActionStatus.Failed,
      output: 'forbidden',
    });

    world.runtime.verify.mockResolvedValueOnce({ recovered: false, detail: 'timed out' });
    const notRecovered = await world.runtimeActions.propose(
      incidentId,
      { kind: RuntimeActionKind.Restart, reason: 'again' },
      ActionProposer.Person
    );
    expect(notRecovered.ok && notRecovered.action.recovered).toBe(false);
    expect((await world.incidents.findById(incidentId))?.status).toBe(IncidentStatus.Open);
    expect(kinds()).toContain(IncidentEventKind.ActionFailed);
    expect(kinds()).toContain(IncidentEventKind.NotRecovered);
  });

  it('refuses actions without a workload, on resolved incidents, and bad scales', async () => {
    const bare = await world.open.execute({ space: 'acme', title: 'No workload' });
    if (!bare.ok) throw new Error(bare.error);
    expect(
      (
        await world.runtimeActions.propose(
          bare.incident.id,
          { kind: RuntimeActionKind.Restart, reason: 'x' },
          ActionProposer.Person
        )
      ).ok
    ).toBe(false);
    expect(
      (
        await world.runtimeActions.propose(
          incidentId,
          { kind: RuntimeActionKind.Scale, reason: 'x' },
          ActionProposer.Person
        )
      ).ok
    ).toBe(false);
    await world.manage.resolve(incidentId);
    expect(
      (
        await world.runtimeActions.propose(
          incidentId,
          { kind: RuntimeActionKind.Restart, reason: 'x' },
          ActionProposer.Person
        )
      ).ok
    ).toBe(false);
  });
});
