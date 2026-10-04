import { describe, it, expect, vi, beforeEach } from 'vitest';

const keys = { create: vi.fn(), revoke: vi.fn() };
const promote = { execute: vi.fn() };

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    const map: Record<string, unknown> = {
      ManageFeedbackKeysUseCase: keys,
      PromoteThemeUseCase: promote,
    };
    if (!(token in map)) throw new Error(`Unknown token: ${token}`);
    return map[token];
  },
}));

const actions = await import('../../../../../src/presentation/web/app/actions/manage-feedback.js');

describe('manage-feedback server actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a new key secret once, and nothing else about the key', async () => {
    keys.create.mockResolvedValue({
      ok: true,
      key: { id: 'k', prefix: 'shep_fb_abcd' },
      secret: 'shep_fb_secret',
    });
    expect(await actions.createFeedbackKey('acme', 'Zendesk')).toEqual({
      ok: true,
      secret: 'shep_fb_secret',
    });
    expect(keys.create).toHaveBeenCalledWith({ space: 'acme', name: 'Zendesk' });
    keys.create.mockRejectedValue(new Error('database is locked'));
    expect(await actions.createFeedbackKey('acme', 'x')).toEqual({
      ok: false,
      error: 'database is locked',
    });
  });

  it('revokes keys and promotes themes', async () => {
    keys.revoke.mockResolvedValue({ ok: true, key: {} });
    expect(await actions.revokeFeedbackKey('k')).toEqual({ ok: true });
    promote.execute.mockResolvedValue({ ok: false, error: 'No theme "x" in Acme.' });
    expect(await actions.promoteTheme({ theme: 'x', reviewHours: 2 })).toEqual({
      ok: false,
      error: 'No theme "x" in Acme.',
    });
  });
});
