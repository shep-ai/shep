import { describe, it, expect, vi, beforeEach } from 'vitest';

const investigate = { start: vi.fn(), run: vi.fn() };
const approve = { execute: vi.fn() };
const list = { execute: vi.fn() };

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    const map: Record<string, unknown> = {
      InvestigateWorkItemUseCase: investigate,
      ApproveHypothesisUseCase: approve,
      GetWorkItemInvestigationsUseCase: list,
    };
    if (!(token in map)) throw new Error(`Unknown token: ${token}`);
    return map[token];
  },
}));

const actions = await import('../../../../../src/presentation/web/app/actions/bug-loop.js');

const INVESTIGATION = { id: 'inv-1', status: 'Pending' };

describe('bug-loop server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
  });

  it('startInvestigation records the investigation and runs it after returning', async () => {
    investigate.start.mockResolvedValue({ ok: true, investigation: INVESTIGATION });
    let finish: () => void = () => undefined;
    investigate.run.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

    const result = await actions.startInvestigation({ workItemId: 'item-1', repositoryPath: '/r' });

    expect(result).toEqual({ ok: true, investigation: INVESTIGATION });
    expect(investigate.start).toHaveBeenCalledWith({ workItem: 'item-1', repositoryPath: '/r' });
    expect(investigate.run).toHaveBeenCalledWith('inv-1');
    finish();
  });

  it('startInvestigation passes refusals and errors on, and logs a crashed run', async () => {
    investigate.start.mockResolvedValueOnce({ ok: false, error: 'busy' });
    expect(await actions.startInvestigation({ workItemId: 'i', repositoryPath: '/r' })).toEqual({
      ok: false,
      error: 'busy',
    });
    investigate.start.mockRejectedValueOnce(new Error('database is locked'));
    expect(await actions.startInvestigation({ workItemId: 'i', repositoryPath: '/r' })).toEqual({
      ok: false,
      error: 'database is locked',
    });

    investigate.start.mockResolvedValueOnce({ ok: true, investigation: INVESTIGATION });
    investigate.run.mockRejectedValueOnce(new Error('boom'));
    await actions.startInvestigation({ workItemId: 'i', repositoryPath: '/r' });
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  });

  it('getLatestInvestigation returns the newest or nothing', async () => {
    list.execute.mockResolvedValueOnce({
      ok: true,
      investigations: [INVESTIGATION, { id: 'old' }],
    });
    expect(await actions.getLatestInvestigation('item-1')).toEqual({
      investigation: INVESTIGATION,
    });
    list.execute.mockResolvedValueOnce({ ok: true, investigations: [] });
    expect(await actions.getLatestInvestigation('item-1')).toEqual({});
    list.execute.mockResolvedValueOnce({ ok: false, error: 'Work item not found' });
    expect(await actions.getLatestInvestigation('x')).toEqual({ error: 'Work item not found' });
  });

  it('approveHypothesis returns the feature id without waiting for it to start', async () => {
    approve.execute.mockResolvedValue({
      ok: true,
      feature: { id: 'feat-1' },
      started: new Promise(() => undefined),
    });
    expect(
      await actions.approveHypothesis({
        workItemId: 'item-1',
        investigationId: 'inv-1',
        hypothesis: 2,
        fullSpec: false,
      })
    ).toEqual({ ok: true, featureId: 'feat-1' });
    expect(approve.execute).toHaveBeenCalledWith({
      workItem: 'item-1',
      investigationId: 'inv-1',
      hypothesis: 2,
      fullSpec: false,
    });
  });

  it('approveHypothesis passes refusals on', async () => {
    approve.execute.mockResolvedValue({ ok: false, error: 'already approved' });
    expect(
      await actions.approveHypothesis({
        workItemId: 'i',
        investigationId: 'v',
        hypothesis: 1,
        fullSpec: false,
      })
    ).toEqual({ ok: false, error: 'already approved' });
  });
});
