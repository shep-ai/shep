import { describe, it, expect, vi, beforeEach } from 'vitest';

const signals = { record: vi.fn(), link: vi.fn(), remove: vi.fn() };
const opportunities = { create: vi.fn(), estimate: vi.fn(), accept: vi.fn(), drop: vi.fn() };
const build = { execute: vi.fn() };
const weights = { set: vi.fn() };

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    const map: Record<string, unknown> = {
      ManageSignalsUseCase: signals,
      ManageOpportunitiesUseCase: opportunities,
      BuildOpportunityUseCase: build,
      ManageOpportunityWeightsUseCase: weights,
    };
    if (!(token in map)) throw new Error(`Unknown token: ${token}`);
    return map[token];
  },
}));

const actions = await import(
  '../../../../../src/presentation/web/app/actions/manage-opportunities.js'
);

describe('manage-opportunities server actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes each call to its use case and returns only the outcome', async () => {
    signals.record.mockResolvedValue({ ok: true, signal: { id: 's' } });
    expect(await actions.recordSignal({ title: 'x' })).toEqual({ ok: true });
    signals.link.mockResolvedValue({ ok: true, signal: {} });
    await actions.linkSignal('s', null);
    expect(signals.link).toHaveBeenCalledWith('s', null);
    opportunities.drop.mockResolvedValue({ ok: false, error: 'Say why' });
    expect(await actions.dropOpportunity('o', '')).toEqual({ ok: false, error: 'Say why' });
    build.execute.mockResolvedValue({ ok: true, opportunity: {}, workItem: { id: 'w' } });
    expect(await actions.buildOpportunity('o', 'p')).toEqual({ ok: true });
    expect(build.execute).toHaveBeenCalledWith('o', 'p');
  });

  it('turns a throw into a failure', async () => {
    weights.set.mockRejectedValue(new Error('database is locked'));
    expect(await actions.setOpportunityWeights('s', { reach: 1 })).toEqual({
      ok: false,
      error: 'database is locked',
    });
  });
});
