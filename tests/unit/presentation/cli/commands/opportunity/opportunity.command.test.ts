/**
 * `shep signal` and `shep opportunity` (spec 126): thin commands over the
 * opportunity use cases.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpportunityStatus, SignalKind } from '@/domain/generated/output.js';

const { signals, opportunities, board, weights, build } = vi.hoisted(() => ({
  signals: { record: vi.fn(), list: vi.fn(), link: vi.fn(), remove: vi.fn() },
  opportunities: {
    create: vi.fn(),
    estimate: vi.fn(),
    accept: vi.fn(),
    drop: vi.fn(),
    show: vi.fn(),
  },
  board: { execute: vi.fn() },
  weights: { get: vi.fn(), set: vi.fn() },
  build: { execute: vi.fn() },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      const name = typeof token === 'function' ? token.name : String(token);
      const byName: Record<string, unknown> = {
        ManageSignalsUseCase: signals,
        ManageOpportunitiesUseCase: opportunities,
        GetOpportunityBoardUseCase: board,
        ManageOpportunityWeightsUseCase: weights,
        BuildOpportunityUseCase: build,
      };
      if (name in byName) return byName[name];
      throw new Error(`unexpected token ${name}`);
    }),
  },
}));

import { createSignalCommand } from '../../../../../../src/presentation/cli/commands/signal/index.js';
import { createOpportunityCommand } from '../../../../../../src/presentation/cli/commands/opportunity/index.js';

const T = new Date('2026-10-05T10:00:00Z');
const BET = {
  id: 'opp-1',
  spaceId: 's',
  title: 'Faster checkout',
  status: OpportunityStatus.Accepted,
  reviewHours: 4,
  confidence: 0.5,
  strategic: false,
  createdAt: T,
  updatedAt: T,
};
const SCORED = {
  opportunity: BET,
  evidence: { signals: 2, customers: 2, revenueAtStake: 4000, urgentSignals: 1 },
  value: 13,
  score: 1.625,
};

async function run(group: 'signal' | 'opportunity', ...args: string[]): Promise<string> {
  const command = group === 'signal' ? createSignalCommand() : createOpportunityCommand();
  await command.parseAsync(args, { from: 'user' });
  return [
    ...vi.mocked(console.log).mock.calls.flat(),
    ...vi.mocked(console.error).mock.calls.flat(),
  ].join('\n');
}

describe('shep signal / shep opportunity', () => {
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

  it('records a signal with customer, revenue and urgency', async () => {
    signals.record.mockResolvedValue({ ok: true, signal: { id: 'sig-1' } });
    const out = await run(
      'signal',
      'add',
      'Checkout times out',
      '--space',
      'acme',
      '--kind',
      'FEEDBACK',
      '--customer',
      'Globex',
      '--revenue',
      '4000.5',
      '--urgent'
    );
    expect(signals.record).toHaveBeenCalledWith({
      title: 'Checkout times out',
      space: 'acme',
      kind: SignalKind.Feedback,
      customer: 'Globex',
      monthlyRevenue: 4000.5,
      urgent: true,
    });
    expect(out).toContain('sig-1');
  });

  it('refuses an unknown kind and a revenue that is not a number', async () => {
    let out = await run('signal', 'add', 'x', '--kind', 'rumour');
    expect(out).toContain('rumour');
    out = await run('signal', 'add', 'x', '--revenue', 'lots');
    expect(out).toContain('lots');
    expect(signals.record).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('lists unlinked signals of a space', async () => {
    signals.list.mockResolvedValue({
      ok: true,
      signals: [
        {
          id: 'sig-1',
          spaceId: 's',
          kind: SignalKind.Feedback,
          title: 'Dark mode',
          customer: 'Globex',
          urgent: false,
          createdAt: T,
          updatedAt: T,
        },
      ],
    });
    const out = await run('signal', 'ls', '--space', 'acme', '--unlinked');
    expect(signals.list).toHaveBeenCalledWith({ space: 'acme', unlinked: true });
    expect(out).toContain('Dark mode');
    expect(out).toContain('Globex');
  });

  it('adds an opportunity with an estimate', async () => {
    opportunities.create.mockResolvedValue({ ok: true, opportunity: BET });
    await run(
      'opportunity',
      'add',
      'Faster checkout',
      '--hours',
      '6.5',
      '--confidence',
      '0.7',
      '--strategic',
      '--space',
      'acme'
    );
    expect(opportunities.create).toHaveBeenCalledWith({
      title: 'Faster checkout',
      reviewHours: 6.5,
      confidence: 0.7,
      strategic: true,
      space: 'acme',
    });
  });

  it('ranks opportunities and marks the line', async () => {
    board.execute.mockResolvedValue({
      ok: true,
      board: {
        space: { id: 's', name: 'Acme', slug: 'acme' },
        ranked: [SCORED],
        line: { inLine: [SCORED], waiting: [], usedHours: 4, capacityHours: 20 },
        unlinkedSignals: [{ id: 'x' }],
        decided: [],
      },
    });
    const out = await run('opportunity', 'ls', '--space', 'acme');
    expect(out).toContain('Faster checkout');
    expect(out).toContain('1.63');
    expect(out).toContain('4 of 20');
    expect(out).toContain('▶');
    expect(out).toContain('Signals not linked to an opportunity yet: 1');
  });

  it('links signals and decides', async () => {
    for (const fn of [signals.link, opportunities.accept, opportunities.drop]) {
      fn.mockResolvedValue({ ok: true, signal: {}, opportunity: BET });
    }
    build.execute.mockResolvedValue({ ok: true, opportunity: BET, workItem: { id: 'wi-1' } });
    await run('opportunity', 'link', 'sig-1', 'opp-1');
    await run('opportunity', 'unlink', 'sig-1');
    await run('opportunity', 'accept', 'opp-1');
    await run('opportunity', 'drop', 'opp-1', '--reason', 'Covered elsewhere');
    const out = await run('opportunity', 'build', 'opp-1', '--project', 'pay');
    expect(signals.link.mock.calls).toEqual([
      ['sig-1', 'opp-1'],
      ['sig-1', null],
    ]);
    expect(opportunities.drop).toHaveBeenCalledWith('opp-1', 'Covered elsewhere');
    expect(build.execute).toHaveBeenCalledWith('opp-1', 'pay');
    expect(out).toContain('wi-1');
  });

  it('shows weights, or sets the ones given', async () => {
    const current = {
      spaceId: 's',
      reach: 1,
      revenue: 2,
      urgency: 3,
      strategic: 5,
      weeklyReviewHours: 20,
    };
    weights.get.mockResolvedValue({ ok: true, weights: current, isDefault: true });
    weights.set.mockResolvedValue({ ok: true, weights: { ...current, reach: 4 } });
    let out = await run('opportunity', 'weights');
    expect(weights.get).toHaveBeenCalledWith(undefined);
    expect(out).toContain('20');
    out = await run(
      'opportunity',
      'weights',
      '--space',
      'acme',
      '--reach',
      '4',
      '--capacity',
      '12'
    );
    expect(weights.set).toHaveBeenCalledWith('acme', { reach: 4, weeklyReviewHours: 12 });
    expect(out).toContain('reach 4');
  });

  it('prints a refusal and exits 1', async () => {
    opportunities.show.mockResolvedValue({ ok: false, error: 'No opportunity "nope".' });
    const out = await run('opportunity', 'show', 'nope');
    expect(out).toContain('No opportunity');
    expect(process.exitCode).toBe(1);
  });
});
