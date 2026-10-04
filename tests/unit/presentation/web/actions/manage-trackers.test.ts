import { describe, it, expect, vi, beforeEach } from 'vitest';

const connections = { create: vi.fn(), test: vi.fn(), remove: vi.fn() };
const rules = { create: vi.fn(), setEnabled: vi.fn(), remove: vi.fn() };
const runner = { runAll: vi.fn() };
const runOne = { execute: vi.fn() };
const overview = { execute: vi.fn() };

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    const map: Record<string, unknown> = {
      ManageTrackerConnectionsUseCase: connections,
      ManageTrackerSyncRulesUseCase: rules,
      SyncTrackerRulesUseCase: runner,
      RunTrackerSyncUseCase: runOne,
      GetTrackerOverviewUseCase: overview,
    };
    if (!(token in map)) throw new Error(`Unknown token: ${token}`);
    return map[token];
  },
}));

const actions = await import('../../../../../src/presentation/web/app/actions/manage-trackers.js');

describe('manage-trackers server actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes results through and turns throws into failures', async () => {
    connections.create.mockResolvedValue({ ok: false, error: 'Linear: Authentication required' });
    expect(
      await actions.createTrackerConnection({ provider: 'Linear' as never, name: 'L', secret: 'k' })
    ).toEqual({
      ok: false,
      error: 'Linear: Authentication required',
    });
    connections.remove.mockRejectedValue(new Error('database is locked'));
    expect(await actions.removeTrackerConnection('l')).toEqual({
      ok: false,
      error: 'database is locked',
    });
  });

  it('never returns the secret it was given', async () => {
    connections.create.mockResolvedValue({ ok: true, connection: { id: 'c', name: 'L' } });
    const result = await actions.createTrackerConnection({
      provider: 'Linear' as never,
      name: 'L',
      secret: 'lin_api_secret',
    });
    expect(JSON.stringify(result)).not.toContain('lin_api_secret');
  });

  it('routes rule actions', async () => {
    for (const fn of [connections.test, rules.create, rules.setEnabled, rules.remove])
      fn.mockResolvedValue({ ok: true });
    await actions.testTrackerConnection('l');
    await actions.createTrackerSyncRule({ connection: 'l', project: 'pay', scope: 'ENG' });
    await actions.setTrackerSyncRuleEnabled('r1', false);
    await actions.removeTrackerSyncRule('r1');
    expect(connections.test).toHaveBeenCalledWith('l');
    expect(rules.create).toHaveBeenCalledWith({ connection: 'l', project: 'pay', scope: 'ENG' });
    expect(rules.setEnabled).toHaveBeenCalledWith('r1', false);
    expect(rules.remove).toHaveBeenCalledWith('r1');
  });

  it('runs one rule or all of them, failing when any run reported an error', async () => {
    runOne.execute.mockResolvedValue({ ok: true, rule: {}, summary: {} });
    expect(await actions.runTrackerSync('r1')).toEqual({ ok: true });
    expect(runOne.execute).toHaveBeenCalledWith('r1');

    runner.runAll.mockResolvedValue([
      { ok: true, rule: {}, summary: {} },
      { ok: true, rule: {}, summary: {}, error: 'Jira: rate limited' },
    ]);
    expect(await actions.runTrackerSync()).toEqual({ ok: false, error: 'Jira: rate limited' });
  });

  it('loads the overview', async () => {
    overview.execute.mockResolvedValue({ connections: [], spaces: [], projects: [] });
    expect(await actions.getTrackerOverview()).toEqual({
      overview: { connections: [], spaces: [], projects: [] },
    });
  });
});
