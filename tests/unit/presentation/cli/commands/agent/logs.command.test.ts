/**
 * Agent Logs Command Unit Tests
 *
 * `shep agent logs <id>` must read the worker log where the worker wrote it —
 * under SHEP_HOME when set — not at a hard-coded `~/.shep` (spec 116).
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockViewLog = vi.fn();
const mockResolveAgentRun = vi.fn();
const CORE_LOG_PATH = '/custom/shep-home/logs/worker-run-abcdef12.log';
const mockGetLogPath = vi.fn((_runId: string) => CORE_LOG_PATH);

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: () => ({ execute: mockGetLogPath }),
  },
}));

vi.mock('@/application/use-cases/logs/get-worker-log-path.use-case.js', () => ({
  GetWorkerLogPathUseCase: class GetWorkerLogPathUseCase {},
}));

vi.mock('../../../../../../src/presentation/cli/commands/agent/resolve-run.js', () => ({
  resolveAgentRun: (...args: unknown[]) => mockResolveAgentRun(...args),
}));

vi.mock('../../../../../../src/presentation/cli/commands/log-viewer.js', () => ({
  viewLog: (...args: unknown[]) => mockViewLog(...args),
}));

const mockError = vi.fn();
vi.mock('../../../../../../src/presentation/cli/ui/index.js', () => ({
  messages: {
    error: (...args: unknown[]) => mockError(...args),
    info: vi.fn(),
  },
}));

import { createLogsCommand } from '../../../../../../src/presentation/cli/commands/agent/logs.command.js';

describe('agent logs command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('reads the log where core resolves it, not a hard-coded ~/.shep', async () => {
    mockResolveAgentRun.mockResolvedValue({ run: { id: 'run-abcdef12' } });
    mockViewLog.mockResolvedValue(true);

    await createLogsCommand().parseAsync(['run-abc'], { from: 'user' });

    expect(mockGetLogPath).toHaveBeenCalledWith('run-abcdef12');
    expect(mockViewLog).toHaveBeenCalledWith(
      expect.objectContaining({ logPath: CORE_LOG_PATH, lines: 0, label: 'run run-abcd' })
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('reports an unresolvable run without reading any log', async () => {
    mockResolveAgentRun.mockResolvedValue({ error: 'No agent run matches "x"' });

    await createLogsCommand().parseAsync(['x'], { from: 'user' });

    expect(mockError).toHaveBeenCalledWith('No agent run matches "x"');
    expect(mockViewLog).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
