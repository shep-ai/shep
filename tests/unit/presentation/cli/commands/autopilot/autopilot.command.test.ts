/** `shep autopilot` and `shep factory status` (spec 132). */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { manage, pass, status } = vi.hoisted(() => ({
  manage: { get: vi.fn(), set: vi.fn() },
  pass: { run: vi.fn() },
  status: { execute: vi.fn() },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: unknown) => {
      const name = typeof token === 'function' ? token.name : String(token);
      const byName: Record<string, unknown> = {
        ManageAutopilotUseCase: manage,
        RunAutopilotUseCase: pass,
        GetFactoryStatusUseCase: status,
      };
      if (name in byName) return byName[name];
      throw new Error(`unexpected token ${name}`);
    }),
  },
}));

import { createAutopilotCommand } from '../../../../../../src/presentation/cli/commands/autopilot/index.js';
import { createFactoryCommand } from '../../../../../../src/presentation/cli/commands/factory/index.js';

const T = new Date('2026-10-06T03:00:00Z');
const SPACE = { id: 'space-acme', name: 'Acme', slug: 'acme' };
const POLICY = {
  spaceId: SPACE.id,
  investigateUrgent: true,
  fixConfident: true,
  mergeFixes: false,
  fillLine: true,
  projectId: 'p-pay',
  dailyFixBudget: 3,
  updatedAt: T,
};
const RUN = {
  id: 'run-1',
  spaceId: SPACE.id,
  investigated: ['PAY-42'],
  fixed: ['PAY-42'],
  built: ['Dark mode'],
  errors: ['PAY-40: no repository'],
  createdAt: T,
  updatedAt: T,
};

async function cli(group: 'autopilot' | 'factory', ...args: string[]): Promise<string> {
  const command = group === 'autopilot' ? createAutopilotCommand() : createFactoryCommand();
  await command.parseAsync(args, { from: 'user' });
  return [
    ...vi.mocked(console.log).mock.calls.flat(),
    ...vi.mocked(console.error).mock.calls.flat(),
  ].join('\n');
}

describe('shep autopilot', () => {
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

  it('shows the policy and recent passes', async () => {
    manage.get.mockResolvedValue({
      ok: true,
      space: SPACE,
      policy: POLICY,
      isDefault: false,
      project: { id: 'p-pay', name: 'Payments', slug: 'payments' },
      runs: [RUN],
    });
    const out = await cli('autopilot', 'show', '--space', 'acme');
    expect(manage.get).toHaveBeenCalledWith('acme');
    expect(out).toContain('Payments (payments)');
    expect(out).toContain('PAY-42');
    expect(out).toContain('no repository');
  });

  it('sets the parts it names', async () => {
    manage.set.mockResolvedValue({ ok: true, policy: POLICY });
    await cli(
      'autopilot',
      'set',
      '--space',
      'acme',
      '--investigate',
      '--fix',
      '--no-merge-fixes',
      '--fill-line',
      '--project',
      'pay',
      '--budget',
      '3'
    );
    expect(manage.set).toHaveBeenCalledWith('acme', {
      investigateUrgent: true,
      fixConfident: true,
      mergeFixes: false,
      fillLine: true,
      project: 'pay',
      dailyFixBudget: 3,
    });
    await cli('autopilot', 'set', '--no-fill-line', '--clear-project');
    expect(manage.set).toHaveBeenLastCalledWith(undefined, { fillLine: false, project: null });
  });

  it('refuses a budget that is not a number', async () => {
    const out = await cli('autopilot', 'set', '--budget', 'many');
    expect(manage.set).not.toHaveBeenCalled();
    expect(out).toContain('many');
    expect(process.exitCode).toBe(1);
  });

  it('runs a pass now and prints what it started', async () => {
    pass.run.mockResolvedValue({ ok: true, run: RUN });
    const out = await cli('autopilot', 'run', '--space', 'acme');
    expect(pass.run).toHaveBeenCalledWith('acme');
    expect(out).toContain('PAY-42');
    expect(out).toContain('Dark mode');
  });

  it('prints the factory status of a space', async () => {
    status.execute.mockResolvedValue({
      ok: true,
      status: {
        space: SPACE,
        line: { usedHours: 12, capacityHours: 16, inLine: 2, waiting: 1 },
        building: 2,
        features: { inFlight: 3, awaitingApproval: 1 },
        openIncidents: 1,
        actionsAwaitingApproval: 1,
        pendingOutcomes: 3,
        customersToTell: 2,
        autopilot: { policy: POLICY, isDefault: false, lastRun: RUN },
      },
    });
    const out = await cli('factory', 'status', '--space', 'acme');
    expect(status.execute).toHaveBeenCalledWith('acme');
    expect(out).toContain('12/16');
    expect(out).toContain('3 in flight, 1 waiting for approval');
    expect(out).toContain('Acme');
  });
});
