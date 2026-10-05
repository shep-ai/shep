/** `shep outcome` (spec 130): thin commands over the outcome use cases. */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpportunityStatus, OutcomeVerdict } from '@/domain/generated/output.js';

const { track, manage } = vi.hoisted(() => ({
  track: { run: vi.fn() },
  manage: {
    list: vi.fn(),
    show: vi.fn(),
    ship: vi.fn(),
    tell: vi.fn(),
    recordHours: vi.fn(),
  },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      const name = typeof token === 'function' ? token.name : String(token);
      const byName: Record<string, unknown> = {
        TrackOutcomesUseCase: track,
        ManageOutcomesUseCase: manage,
      };
      if (name in byName) return byName[name];
      throw new Error(`unexpected token ${name}`);
    }),
  },
}));

import { createOutcomeCommand } from '../../../../../../src/presentation/cli/commands/outcome/index.js';

const T = new Date('2026-10-01T10:00:00Z');
const OPPORTUNITY = {
  id: 'opp-1',
  spaceId: 's1',
  title: 'Faster guest checkout',
  status: OpportunityStatus.Shipped,
  reviewHours: 4,
  confidence: 0.7,
  strategic: false,
  shippedAt: T,
  createdAt: T,
  updatedAt: T,
};
const OUTCOME = {
  id: 'out-1',
  opportunityId: 'opp-1',
  spaceId: 's1',
  shippedAt: T,
  reviewAt: new Date('2026-10-15T10:00:00Z'),
  verdict: OutcomeVerdict.Solved,
  signalsBefore: 6,
  signalsAfter: 2,
  createdAt: T,
  updatedAt: T,
};
const CUSTOMERS = [{ customer: 'Globex', signalIds: ['s1'], urls: ['https://t/1'] }];

async function cli(...args: string[]): Promise<string> {
  await createOutcomeCommand().parseAsync(args, { from: 'user' });
  return [
    ...vi.mocked(console.log).mock.calls.flat(),
    ...vi.mocked(console.error).mock.calls.flat(),
  ].join('\n');
}

describe('shep outcome', () => {
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

  it('lists outcomes with their counts and the space calibration', async () => {
    manage.list.mockResolvedValue({
      ok: true,
      space: { id: 's1', name: 'Acme', slug: 'acme' },
      outcomes: [{ outcome: OUTCOME, opportunity: OPPORTUNITY, customers: CUSTOMERS }],
      calibration: { judged: 4, solved: 3, timed: 2, hoursRatio: 1.4 },
    });
    const out = await cli('ls', '--space', 'acme');
    expect(manage.list).toHaveBeenCalledWith('acme');
    expect(out).toContain('Faster guest checkout');
    expect(out).toContain('6 → 2');
    expect(out).toContain('1.4×');
    expect(out).toContain('3 of 4');
  });

  it('checks for ships and verdicts now', async () => {
    track.run.mockResolvedValue({ shipped: [OPPORTUNITY], reopened: [], judged: [OUTCOME] });
    const out = await cli('check');
    expect(track.run).toHaveBeenCalled();
    expect(out).toContain('Faster guest checkout');
  });

  it('ships by hand', async () => {
    manage.ship.mockResolvedValue({ ok: true, opportunity: OPPORTUNITY, outcome: OUTCOME });
    expect(await cli('ship', 'opp-1')).toContain('Faster guest checkout');
    expect(manage.ship).toHaveBeenCalledWith('opp-1');
  });

  it('prints the customers to tell with a note, and marks them told with --done', async () => {
    manage.show.mockResolvedValue({
      ok: true,
      view: { outcome: OUTCOME, opportunity: OPPORTUNITY, customers: CUSTOMERS },
    });
    const out = await cli('tell', 'opp-1');
    expect(out).toContain('Globex');
    expect(out).toContain('https://t/1');
    expect(out).toContain('Faster guest checkout');
    expect(manage.tell).not.toHaveBeenCalled();

    manage.tell.mockResolvedValue({ ok: true, customers: CUSTOMERS });
    expect(await cli('tell', 'opp-1', '--done')).toContain('1');
    expect(manage.tell).toHaveBeenCalledWith('opp-1');
  });

  it('records review hours, refusing text that is not a number', async () => {
    manage.recordHours.mockResolvedValue({
      ok: true,
      outcome: { ...OUTCOME, actualReviewHours: 9 },
    });
    await cli('hours', 'opp-1', '9');
    expect(manage.recordHours).toHaveBeenCalledWith('opp-1', 9);

    vi.clearAllMocks();
    const out = await cli('hours', 'opp-1', 'lots');
    expect(manage.recordHours).not.toHaveBeenCalled();
    expect(out).toContain('lots');
    expect(process.exitCode).toBe(1);
  });

  it('prints a refusal and exits 1', async () => {
    manage.ship.mockResolvedValue({ ok: false, error: 'CSV export is Dropped; it cannot ship.' });
    expect(await cli('ship', 'opp-9')).toContain('cannot ship');
    expect(process.exitCode).toBe(1);
  });
});
