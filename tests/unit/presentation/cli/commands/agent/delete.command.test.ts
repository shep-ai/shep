/**
 * `shep agent delete --force` — refuses to stop the run it is running inside
 *
 * `--force` on delete means "stop the run first, then delete it". From inside
 * that same run it is the agent killing itself, so it refuses and points at
 * the explicit way to do it.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockStop, mockDelete, mockResolveRun } = vi.hoisted(() => ({
  mockStop: vi.fn(),
  mockDelete: vi.fn(),
  mockResolveRun: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: { name?: string }) =>
      token?.name === 'StopAgentRunUseCase' ? { execute: mockStop } : { execute: mockDelete }
    ),
  },
}));
vi.mock('@cli/presentation/cli/commands/agent/resolve-run.js', () => ({
  resolveAgentRun: mockResolveRun,
}));
vi.mock('@cli/presentation/cli/ui/index.js', () => ({
  messages: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  colors: { accent: (s: string) => s },
}));

import { createDeleteCommand } from '@cli/presentation/cli/commands/agent/delete.command.js';
import { messages } from '@cli/presentation/cli/ui/index.js';

describe('agent delete --force — inside an agent run', () => {
  const saved = process.env.SHEP_AGENT_RUN_ID;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    savedExitCode = process.exitCode;
    process.exitCode = 0;
    process.env.SHEP_AGENT_RUN_ID = 'run-self';
    mockStop.mockResolvedValue({ stopped: true, reason: 'ok' });
    mockDelete.mockResolvedValue({ deleted: true });
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.SHEP_AGENT_RUN_ID;
    else process.env.SHEP_AGENT_RUN_ID = saved;
    process.exitCode = savedExitCode;
  });

  it('refuses to stop and delete its own running run', async () => {
    mockResolveRun.mockResolvedValue({ run: { id: 'run-self', status: 'running' } });

    await createDeleteCommand().parseAsync(['run-self', '--force'], { from: 'user' });

    expect(mockStop).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(messages.error).toHaveBeenCalledWith(expect.stringContaining('shep agent stop'));
    expect(process.exitCode).toBe(1);
  });

  it("still force-deletes another feature's running run", async () => {
    mockResolveRun.mockResolvedValue({ run: { id: 'run-other', status: 'running' } });

    await createDeleteCommand().parseAsync(['run-other', '--force'], { from: 'user' });

    expect(mockStop).toHaveBeenCalledWith('run-other');
    expect(mockDelete).toHaveBeenCalledWith('run-other');
  });
});
