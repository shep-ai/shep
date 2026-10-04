import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = { execute: vi.fn() };
const fetch = { execute: vi.fn() };
const address = { start: vi.fn(), run: vi.fn() };

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    const map: Record<string, unknown> = {
      GetPrCommentsUseCase: get,
      FetchPrCommentsUseCase: fetch,
      AddressPrCommentsUseCase: address,
    };
    if (!(token in map)) throw new Error(`Unknown token: ${token}`);
    return map[token];
  },
}));

const actions = await import('../../../../../src/presentation/web/app/actions/pr-comments.js');

describe('pr-comments server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
  });

  it('getPrComments returns the stored snapshot or the refusal', async () => {
    get.execute.mockResolvedValueOnce({ ok: true, feature: {}, comments: [1], rounds: [2] });
    expect(await actions.getPrComments('f')).toEqual({ ok: true, comments: [1], rounds: [2] });
    get.execute.mockRejectedValueOnce(new Error('database is locked'));
    expect(await actions.getPrComments('f')).toEqual({ ok: false, error: 'database is locked' });
  });

  it('refreshPrComments reads GitHub first', async () => {
    fetch.execute.mockResolvedValueOnce({ ok: false, error: 'no open pull request' });
    expect(await actions.refreshPrComments('f')).toEqual({
      ok: false,
      error: 'no open pull request',
    });
    expect(get.execute).not.toHaveBeenCalled();

    fetch.execute.mockResolvedValueOnce({ ok: true });
    get.execute.mockResolvedValueOnce({ ok: true, comments: [], rounds: [] });
    expect(await actions.refreshPrComments('f')).toEqual({ ok: true, comments: [], rounds: [] });
  });

  it('addressPrComments starts a round and runs it after returning', async () => {
    const round = { id: 'r1' };
    address.start.mockResolvedValue({ ok: true, round, comments: [] });
    address.run.mockReturnValue(new Promise(() => undefined));
    expect(await actions.addressPrComments('f', ['c1'])).toEqual({ ok: true, round });
    expect(address.start).toHaveBeenCalledWith({ feature: 'f', commentIds: ['c1'] });
    expect(address.run).toHaveBeenCalledWith('r1');

    address.start.mockResolvedValueOnce({ ok: false, error: 'busy' });
    expect(await actions.addressPrComments('f')).toEqual({ ok: false, error: 'busy' });
    expect(address.start).toHaveBeenLastCalledWith({ feature: 'f' });
  });

  it('logs a round that crashed before recording its failure', async () => {
    address.start.mockResolvedValue({ ok: true, round: { id: 'r1' }, comments: [] });
    address.run.mockRejectedValue(new Error('boom'));
    await actions.addressPrComments('f');
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  });
});
