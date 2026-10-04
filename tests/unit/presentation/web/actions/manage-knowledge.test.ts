import { describe, it, expect, vi, beforeEach } from 'vitest';

const sources = { create: vi.fn(), setEnabled: vi.fn(), remove: vi.fn() };
const syncOne = { execute: vi.fn() };
const syncAll = { runAll: vi.fn() };

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    const map: Record<string, unknown> = {
      ManageKnowledgeSourcesUseCase: sources,
      SyncKnowledgeSourceUseCase: syncOne,
      SyncKnowledgeSourcesUseCase: syncAll,
    };
    if (!(token in map)) throw new Error(`Unknown token: ${token}`);
    return map[token];
  },
}));

const actions = await import('../../../../../src/presentation/web/app/actions/manage-knowledge.js');

describe('manage-knowledge server actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds a source and passes a refusal through', async () => {
    sources.create.mockResolvedValue({ ok: true, source: { id: 's1' } });
    expect(
      await actions.createKnowledgeSource({ connection: 'c', scope: 'https://notion.so/x' })
    ).toEqual({ ok: true });
    sources.create.mockResolvedValue({ ok: false, error: 'Not shared with the integration' });
    expect(await actions.createKnowledgeSource({ connection: 'c', scope: 'x' })).toEqual({
      ok: false,
      error: 'Not shared with the integration',
    });
  });

  it('pauses, resumes and removes a source; a throw becomes a failure', async () => {
    sources.setEnabled.mockResolvedValue({ ok: true });
    expect(await actions.setKnowledgeSourceEnabled('s1', false)).toEqual({ ok: true });
    expect(sources.setEnabled).toHaveBeenCalledWith('s1', false);
    sources.remove.mockRejectedValue(new Error('database is locked'));
    expect(await actions.removeKnowledgeSource('s1')).toEqual({
      ok: false,
      error: 'database is locked',
    });
  });

  it('syncs one source or all of them, failing with the first stopped run', async () => {
    syncOne.execute.mockResolvedValue({ ok: true, summary: {} });
    expect(await actions.syncKnowledge('s1')).toEqual({ ok: true });
    expect(syncOne.execute).toHaveBeenCalledWith('s1');

    syncAll.runAll.mockResolvedValue([
      { ok: true, summary: {} },
      { ok: true, summary: {}, error: 'Notion: rate limited' },
    ]);
    expect(await actions.syncKnowledge()).toEqual({ ok: false, error: 'Notion: rate limited' });
  });
});
