import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = { execute: vi.fn() };
const weights = { setDiscovery: vi.fn() };

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    const map: Record<string, unknown> = {
      RunDiscoveryUseCase: run,
      ManageOpportunityWeightsUseCase: weights,
    };
    if (!(token in map)) throw new Error(`Unknown token: ${token}`);
    return map[token];
  },
}));

const actions = await import('../../../../../src/presentation/web/app/actions/discovery.js');

describe('discovery server actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs discovery in a space and passes refusals through', async () => {
    run.execute.mockResolvedValue({ ok: true, run: {}, opportunities: [] });
    expect(await actions.runDiscovery('s-acme')).toEqual({ ok: true });
    expect(run.execute).toHaveBeenCalledWith({ space: 's-acme' });
    run.execute.mockResolvedValue({ ok: false, error: 'Discovery is already running in Acme.' });
    expect(await actions.runDiscovery('s-acme')).toEqual({
      ok: false,
      error: 'Discovery is already running in Acme.',
    });
  });

  it('sets or clears the schedule', async () => {
    weights.setDiscovery.mockResolvedValue({ ok: true, weights: {} });
    await actions.setDiscoverySchedule('s-acme', null);
    expect(weights.setDiscovery).toHaveBeenCalledWith('s-acme', null);
  });
});
