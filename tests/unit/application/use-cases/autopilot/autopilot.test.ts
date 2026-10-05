import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { InvestigationStatus } from '@/domain/generated/output.js';
import { ACME } from '../opportunities/opportunity.fixtures.js';
import { NOW, autopilotWorld, completed } from './autopilot.fixtures.js';

describe('Autopilot (spec 132)', () => {
  let world: ReturnType<typeof autopilotWorld>;

  beforeEach(() => {
    world = autopilotWorld();
  });

  describe('policy', () => {
    it('shows the off default until set', async () => {
      const shown = await world.manage.get('acme');
      if (!shown.ok) throw new Error(shown.error);
      expect(shown.isDefault).toBe(true);
      expect(shown.policy.fillLine).toBe(false);
    });

    it('sets parts, resolving the project by slug, and refuses bad values', async () => {
      const set = await world.manage.set('acme', {
        investigateUrgent: true,
        fillLine: true,
        project: 'pay',
        dailyFixBudget: 5,
      });
      if (!set.ok) throw new Error(set.error);
      expect(set.policy).toMatchObject({ fillLine: true, projectId: 'p-pay', dailyFixBudget: 5 });

      expect((await world.manage.set('acme', { project: 'nowhere' })).ok).toBe(false);
      expect((await world.manage.set('acme', { dailyFixBudget: 2.5 })).ok).toBe(false);
      expect((await world.manage.set('acme', { dailyFixBudget: 99 })).ok).toBe(false);
      expect((await world.manage.set('acme', { project: null })).ok).toBe(false);
      expect((await world.manage.set('acme', { fillLine: false, project: null })).ok).toBe(true);
    });
  });

  describe('pass', () => {
    it('does nothing in a space without autopilot', async () => {
      expect(await world.pass.runAll(NOW)).toEqual([]);
      expect(world.urgent.execute).not.toHaveBeenCalled();
    });

    it('investigates an urgent work item once, then fixes a confident hypothesis', async () => {
      await world.manage.set('acme', { investigateUrgent: true, fixConfident: true });
      const [run] = await world.pass.runAll(NOW);
      expect(world.investigate.start).toHaveBeenCalledWith({
        workItem: 'wi-1',
        repositoryPath: '/work/pay',
      });
      expect(world.investigate.run).toHaveBeenCalledWith('inv-new');
      expect(world.approve.execute).toHaveBeenCalledWith({
        workItem: 'wi-1',
        hypothesis: 1,
        investigationId: 'inv-new',
        approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
      });
      expect(run).toMatchObject({ spaceId: ACME.id, investigated: ['PAY-42'], fixed: ['PAY-42'] });

      world.investigations.set('wi-1', [completed({ id: 'inv-new', featureId: 'feat-1' })]);
      const [again] = await world.pass.runAll(NOW);
      expect(world.investigate.start).toHaveBeenCalledTimes(1);
      expect(world.approve.execute).toHaveBeenCalledTimes(1);
      expect(again.investigated).toEqual([]);
    });

    it('leaves a work item alone while an investigation is running', async () => {
      await world.manage.set('acme', { investigateUrgent: true, fixConfident: true });
      world.investigations.set('wi-1', [completed({ status: InvestigationStatus.Running })]);
      await world.pass.runAll(NOW);
      expect(world.investigate.start).not.toHaveBeenCalled();
      expect(world.approve.execute).not.toHaveBeenCalled();
    });

    it('stops fixing when the daily budget is spent', async () => {
      await world.manage.set('acme', { fixConfident: true, dailyFixBudget: 0 });
      world.investigations.set('wi-1', [completed()]);
      const [run] = await world.pass.runAll(NOW);
      expect(world.approve.execute).not.toHaveBeenCalled();
      expect(run.fixed).toEqual([]);
    });

    it('builds the accepted opportunities in the line into the project', async () => {
      await world.manage.set('acme', { fillLine: true, project: 'pay' });
      const [run] = await world.pass.runAll(NOW);
      expect(world.build.execute).toHaveBeenCalledTimes(1);
      expect(world.build.execute).toHaveBeenCalledWith('opp-a', 'p-pay');
      expect(run.built).toEqual(['opp-a']);
    });

    it('records failures and keeps going', async () => {
      await world.manage.set('acme', { investigateUrgent: true, fillLine: true, project: 'pay' });
      world.investigate.start.mockResolvedValueOnce({
        ok: false,
        error: 'Pick the repository to investigate PAY-42 in.',
      } as never);
      const [run] = await world.pass.runAll(NOW);
      expect(run.errors).toEqual(['PAY-42: Pick the repository to investigate PAY-42 in.']);
      expect(run.built).toEqual(['opp-a']);
      expect(world.runs.rows).toHaveLength(1);
    });

    it('runs one space now, refusing where autopilot is off', async () => {
      expect((await world.pass.run('acme')).ok).toBe(false);
      await world.manage.set('acme', { fillLine: true, project: 'pay' });
      const ran = await world.pass.run('acme');
      expect(ran.ok && ran.run.built).toEqual(['opp-a']);
    });
  });
});
