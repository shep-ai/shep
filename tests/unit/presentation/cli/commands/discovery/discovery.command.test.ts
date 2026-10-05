/** `shep discovery` (spec 128): run, history and schedule over the discovery use cases. */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentType, DiscoveryRunStatus } from '@/domain/generated/output.js';

const { run, list, weights } = vi.hoisted(() => ({
  run: { execute: vi.fn() },
  list: { execute: vi.fn() },
  weights: { setDiscovery: vi.fn() },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      const name = typeof token === 'function' ? token.name : String(token);
      const byName: Record<string, unknown> = {
        RunDiscoveryUseCase: run,
        ListDiscoveryRunsUseCase: list,
        ManageOpportunityWeightsUseCase: weights,
      };
      if (name in byName) return byName[name];
      throw new Error(`unexpected token ${name}`);
    }),
  },
}));

import { createDiscoveryCommand } from '../../../../../../src/presentation/cli/commands/discovery/index.js';

const T = new Date('2026-10-05T10:00:00Z');

async function cli(...args: string[]): Promise<string> {
  await createDiscoveryCommand().parseAsync(args, { from: 'user' });
  return [
    ...vi.mocked(console.log).mock.calls.flat(),
    ...vi.mocked(console.error).mock.calls.flat(),
  ].join('\n');
}

describe('shep discovery', () => {
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

  it('runs discovery and prints what it proposed', async () => {
    run.execute.mockResolvedValue({
      ok: true,
      run: { proposed: 1, dropped: 2, signalsRead: 9 },
      opportunities: [{ id: 'opp-1', title: 'Faster guest checkout' }],
    });
    const out = await cli('run', '--space', 'acme', '--agent', AgentType.ClaudeCode);
    expect(run.execute).toHaveBeenCalledWith({ space: 'acme', agentType: AgentType.ClaudeCode });
    expect(out).toContain('Faster guest checkout');
    expect(out).toContain('9');
  });

  it('prints a refusal and exits 1', async () => {
    run.execute.mockResolvedValue({ ok: false, error: 'Acme has no unlinked signals to read.' });
    const out = await cli('run');
    expect(run.execute).toHaveBeenCalledWith({});
    expect(out).toContain('no unlinked signals');
    expect(process.exitCode).toBe(1);
  });

  it('lists runs', async () => {
    list.execute.mockResolvedValue({
      ok: true,
      runs: [
        {
          id: 'r1',
          status: DiscoveryRunStatus.Failed,
          signalsRead: 4,
          proposed: 0,
          dropped: 0,
          error: 'timed out',
          createdAt: T,
          updatedAt: T,
        },
      ],
    });
    const out = await cli('ls', '--space', 'acme');
    expect(list.execute).toHaveBeenCalledWith('acme');
    expect(out).toContain('timed out');
  });

  it('schedules and unschedules discovery', async () => {
    weights.setDiscovery.mockResolvedValue({ ok: true, weights: {} });
    await cli('schedule', '--space', 'acme', '--every', '24');
    await cli('schedule', '--space', 'acme', '--off');
    expect(weights.setDiscovery.mock.calls).toEqual([
      ['acme', 24],
      ['acme', null],
    ]);
    const out = await cli('schedule', '--space', 'acme');
    expect(out).toContain('--every');
    expect(weights.setDiscovery).toHaveBeenCalledTimes(2);
  });
});
