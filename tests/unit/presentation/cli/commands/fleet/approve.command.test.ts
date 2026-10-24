/**
 * Fleet Approve Command Unit Tests
 *
 * Two contracts are pinned here:
 *  1. `--low-risk` is passed through as a filter, and never as "approve all".
 *  2. The exit code is the truth. `shep fleet approve --all && …` must not
 *     carry on when a selected gate is still waiting — whether it failed or was
 *     deliberately skipped as not low-risk.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockApproveExecute } = vi.hoisted(() => ({
  mockApproveExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: () => ({ execute: mockApproveExecute }) },
}));

import { createApproveCommand } from '../../../../../../src/presentation/cli/commands/fleet/approve.command.js';

function result(overrides: Record<string, unknown> = {}) {
  return {
    totalAttempted: 0,
    approvedCount: 0,
    approvedFeatureIds: [],
    failedCount: 0,
    failures: [],
    skippedCount: 0,
    skipped: [],
    ...overrides,
  };
}

async function run(args: string[]): Promise<void> {
  await createApproveCommand().parseAsync(args, { from: 'user' });
}

function printed(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
}

describe('createApproveCommand', () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.exitCode = undefined;
  });

  it('exits 1 without touching the fleet when no scope is given', async () => {
    await run([]);

    expect(mockApproveExecute).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('accepts --low-risk as a scope of its own', async () => {
    mockApproveExecute.mockResolvedValue(result());

    await run(['--low-risk']);

    expect(mockApproveExecute).toHaveBeenCalledWith({
      gateType: undefined,
      lowRisk: true,
    });
    expect(process.exitCode).toBeUndefined();
  });

  it('passes --gate through by name', async () => {
    mockApproveExecute.mockResolvedValue(result());

    await run(['--gate', 'plan']);

    expect(mockApproveExecute).toHaveBeenCalledWith({
      gateType: 'plan',
      lowRisk: undefined,
    });
  });

  it('exits 0 when every selected gate was approved', async () => {
    mockApproveExecute.mockResolvedValue(
      result({ totalAttempted: 2, approvedCount: 2, approvedFeatureIds: ['a', 'b'] })
    );

    await run(['--all']);

    expect(process.exitCode).toBeUndefined();
  });

  it('exits 1 when a selected gate was skipped as not low-risk', async () => {
    mockApproveExecute.mockResolvedValue(
      result({
        totalAttempted: 2,
        approvedCount: 1,
        approvedFeatureIds: ['a'],
        skippedCount: 1,
        skipped: [{ featureId: 'b', reason: 'Diff lines (900) exceed maximum permitted (200)' }],
      })
    );

    await run(['--low-risk']);

    expect(process.exitCode).toBe(1);
  });

  it('exits 1 when an approval failed', async () => {
    mockApproveExecute.mockResolvedValue(
      result({
        totalAttempted: 1,
        approvedCount: 0,
        failedCount: 1,
        failures: [{ featureId: 'a', reason: 'Worktree lock busy' }],
      })
    );

    await run(['--all']);

    expect(process.exitCode).toBe(1);
  });

  it('says why nothing was approved when no guardrail rules are configured', async () => {
    const reason = 'No guardrail rules configured for the plan gate — nothing is low-risk';
    mockApproveExecute.mockResolvedValue(
      result({
        totalAttempted: 1,
        approvedCount: 0,
        skippedCount: 1,
        skipped: [{ featureId: 'a', reason }],
      })
    );

    await run(['--low-risk']);

    expect(printed(log)).toContain('guardrail rules');
    expect(process.exitCode).toBe(1);
  });

  it('groups skipped features by reason instead of repeating the reason per feature', async () => {
    const reason = 'No guardrail rules configured for the plan gate — nothing is low-risk';
    mockApproveExecute.mockResolvedValue(
      result({
        totalAttempted: 3,
        approvedCount: 0,
        skippedCount: 3,
        skipped: [
          { featureId: 'alpha', reason },
          { featureId: 'beta', reason },
          { featureId: 'gamma', reason },
        ],
      })
    );

    await run(['--low-risk']);

    const output = printed(log);
    expect(output.split(reason)).toHaveLength(2);
    expect(output).toContain('alpha');
    expect(output).toContain('beta');
    expect(output).toContain('gamma');
  });

  it('exits 0 when nothing was waiting on a gate', async () => {
    mockApproveExecute.mockResolvedValue(result());

    await run(['--all']);

    expect(process.exitCode).toBeUndefined();
  });
});
