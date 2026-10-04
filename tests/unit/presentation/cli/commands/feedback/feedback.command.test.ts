/** `shep feedback` (spec 127): keys, themes and promotion over the feedback use cases. */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpportunityStatus } from '@/domain/generated/output.js';

const { keys, themes, promote } = vi.hoisted(() => ({
  keys: { create: vi.fn(), list: vi.fn(), revoke: vi.fn() },
  themes: { execute: vi.fn() },
  promote: { execute: vi.fn() },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      const name = typeof token === 'function' ? token.name : String(token);
      const byName: Record<string, unknown> = {
        ManageFeedbackKeysUseCase: keys,
        GetFeedbackThemesUseCase: themes,
        PromoteThemeUseCase: promote,
      };
      if (name in byName) return byName[name];
      throw new Error(`unexpected token ${name}`);
    }),
  },
}));

import { createFeedbackCommand } from '../../../../../../src/presentation/cli/commands/feedback/index.js';

const T = new Date('2026-10-05T10:00:00Z');

async function run(...args: string[]): Promise<string> {
  await createFeedbackCommand().parseAsync(args, { from: 'user' });
  return [
    ...vi.mocked(console.log).mock.calls.flat(),
    ...vi.mocked(console.error).mock.calls.flat(),
  ].join('\n');
}

describe('shep feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    process.exitCode = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('creates a key and prints the secret once with the endpoint', async () => {
    keys.create.mockResolvedValue({
      ok: true,
      key: { id: 'k1', name: 'Zendesk', prefix: 'shep_fb_abcd', spaceId: 's' },
      secret: 'shep_fb_abcdef123',
    });
    const out = await run('key', 'create', '--space', 'acme', '--name', 'Zendesk');
    expect(keys.create).toHaveBeenCalledWith({ space: 'acme', name: 'Zendesk' });
    expect(out).toContain('shep_fb_abcdef123');
    expect(out).toContain('/api/feedback');
  });

  it('lists keys by prefix and revokes one', async () => {
    keys.list.mockResolvedValue({
      ok: true,
      keys: [
        {
          id: 'k1',
          name: 'Zendesk',
          prefix: 'shep_fb_abcd',
          spaceId: 's',
          lastUsedAt: T,
          createdAt: T,
          updatedAt: T,
        },
        {
          id: 'k2',
          name: 'Old',
          prefix: 'shep_fb_efgh',
          spaceId: 's',
          revokedAt: T,
          createdAt: T,
          updatedAt: T,
        },
      ],
    });
    const out = await run('key', 'ls', '--space', 'acme');
    expect(keys.list).toHaveBeenCalledWith('acme');
    expect(out).toContain('shep_fb_abcd');
    expect(out).toContain('revoked');
    keys.revoke.mockResolvedValue({ ok: true, key: {} });
    await run('key', 'revoke', 'k1');
    expect(keys.revoke).toHaveBeenCalledWith('k1');
  });

  it('lists themes with their evidence', async () => {
    themes.execute.mockResolvedValue({
      ok: true,
      space: { name: 'Acme' },
      themes: [
        {
          key: 'sig-1',
          label: 'checkout guest timeout',
          signals: [{}, {}, {}],
          evidence: { signals: 3, customers: 2, revenueAtStake: 5000, urgentSignals: 1 },
        },
      ],
    });
    const out = await run('themes', '--space', 'acme');
    expect(themes.execute).toHaveBeenCalledWith('acme');
    expect(out).toContain('checkout guest timeout');
    expect(out).toContain('sig-1');
    expect(out).toContain('5000');
  });

  it('promotes a theme with an estimate', async () => {
    promote.execute.mockResolvedValue({
      ok: true,
      opportunity: {
        id: 'opp-1',
        title: 'Checkout guest timeout',
        status: OpportunityStatus.Proposed,
      },
      linked: 3,
    });
    const out = await run(
      'promote',
      'sig-1',
      '--hours',
      '6',
      '--confidence',
      '0.7',
      '--title',
      'Faster checkout'
    );
    expect(promote.execute).toHaveBeenCalledWith({
      theme: 'sig-1',
      reviewHours: 6,
      confidence: 0.7,
      title: 'Faster checkout',
    });
    expect(out).toContain('opp-1');
    expect(out).toContain('3');
  });

  it('refuses a non-numeric estimate and prints refusals', async () => {
    let out = await run('promote', 'sig-1', '--hours', 'soon');
    expect(out).toContain('soon');
    expect(promote.execute).not.toHaveBeenCalled();
    process.exitCode = undefined;
    themes.execute.mockResolvedValue({ ok: false, error: 'No space "nope".' });
    out = await run('themes', '--space', 'nope');
    expect(out).toContain('No space');
    expect(process.exitCode).toBe(1);
  });
});
