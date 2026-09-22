/**
 * `shep agent stop` — refuses to stop the run it is running inside
 *
 * An agent that runs `shep agent stop` on its own run (or its own feature's)
 * kills itself mid-task. The worker marks its environment; the command refuses
 * from inside that run unless --force is passed.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockExecute, mockResolveRun } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockResolveRun: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: vi.fn(() => ({ execute: mockExecute })) },
}));
vi.mock('@cli/presentation/cli/commands/agent/resolve-run.js', () => ({
  resolveAgentRun: mockResolveRun,
}));
vi.mock('@cli/presentation/cli/ui/index.js', () => ({
  messages: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  colors: { accent: (s: string) => s },
}));

import { createStopCommand } from '@cli/presentation/cli/commands/agent/stop.command.js';
import { messages } from '@cli/presentation/cli/ui/index.js';

describe('agent stop command — inside an agent run', () => {
  const savedRun = process.env.SHEP_AGENT_RUN_ID;
  const savedFeature = process.env.SHEP_FEATURE_ID;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    savedExitCode = process.exitCode;
    process.exitCode = 0;
    process.env.SHEP_AGENT_RUN_ID = 'run-self';
    process.env.SHEP_FEATURE_ID = 'feat-self';
    mockExecute.mockResolvedValue({ stopped: true, reason: 'ok' });
  });

  afterEach(() => {
    if (savedRun === undefined) delete process.env.SHEP_AGENT_RUN_ID;
    else process.env.SHEP_AGENT_RUN_ID = savedRun;
    if (savedFeature === undefined) delete process.env.SHEP_FEATURE_ID;
    else process.env.SHEP_FEATURE_ID = savedFeature;
    process.exitCode = savedExitCode;
  });

  it('refuses to stop its own run', async () => {
    mockResolveRun.mockResolvedValue({ run: { id: 'run-self', featureId: 'feat-self' } });

    await createStopCommand().parseAsync(['run-self'], { from: 'user' });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(messages.error).toHaveBeenCalledWith(expect.stringContaining('--force'));
    expect(process.exitCode).toBe(1);
  });

  it('stops its own run with --force', async () => {
    mockResolveRun.mockResolvedValue({ run: { id: 'run-self', featureId: 'feat-self' } });

    await createStopCommand().parseAsync(['run-self', '--force'], { from: 'user' });

    expect(mockExecute).toHaveBeenCalledWith('run-self');
  });

  it("stops another feature's run without --force", async () => {
    mockResolveRun.mockResolvedValue({ run: { id: 'run-other', featureId: 'feat-other' } });

    await createStopCommand().parseAsync(['run-other'], { from: 'user' });

    expect(mockExecute).toHaveBeenCalledWith('run-other');
  });
});
