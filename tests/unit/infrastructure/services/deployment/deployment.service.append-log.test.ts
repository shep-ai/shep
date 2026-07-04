// @vitest-environment node

/**
 * DeploymentService appendLog Tests
 *
 * Tests for appendLog() (spec 103, task-11): synthetic log lines pushed by
 * the dev-server-agent graph into a target's log buffer so the run's
 * progress is visible via getLogs() AND streamed live over the 'log' event
 * (SSE route).
 *
 * Invariants:
 * - The synthetic entry has stream 'stdout', the given targetId/line, and a
 *   numeric timestamp.
 * - Works for both transient (Analyzing/Installing) and live entries —
 *   whichever buffer the target currently owns.
 * - No entry for the target → no-op (no buffer created, no event emitted).
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  DeploymentService,
  type DeploymentServiceDeps,
} from '@/infrastructure/services/deployment/deployment.service.js';
import type { LogEntry } from '@/application/ports/output/services/deployment-service.interface.js';
import { DeploymentState } from '@/domain/generated/output.js';

function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    killed: boolean;
    unref: ReturnType<typeof vi.fn>;
  };
  child.pid = 12345;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.unref = vi.fn();
  return child;
}

function createMockDeps(mockChild?: ReturnType<typeof createMockChild>): DeploymentServiceDeps {
  const child = mockChild ?? createMockChild();
  return {
    spawn: vi.fn().mockReturnValue(child),
    detectDevScript: vi.fn().mockImplementation((_dirPath: string) => ({
      success: true,
      packageManager: 'npm',
      scriptName: 'dev',
      command: 'npm run dev',
      resolvedDir: _dirPath,
    })),
    kill: vi.fn(),
    isAlive: vi.fn().mockReturnValue(true),
  };
}

describe('DeploymentService — appendLog', () => {
  let service: DeploymentService;
  let deps: DeploymentServiceDeps;
  let mockChild: ReturnType<typeof createMockChild>;

  beforeEach(() => {
    mockChild = createMockChild();
    deps = createMockDeps(mockChild);
    service = new DeploymentService(deps);
  });

  it('pushes a synthetic stdout entry into a transient entry buffer', () => {
    service.setTransientState('feat-1', '/project', 'feature', DeploymentState.Analyzing);

    service.appendLog('feat-1', 'dev-server agent run started');

    const logs = service.getLogs('feat-1')!;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      targetId: 'feat-1',
      stream: 'stdout',
      line: 'dev-server agent run started',
    });
    expect(logs[0].timestamp).toBeTypeOf('number');
  });

  it('pushes into a live entry buffer, interleaved with process output', () => {
    service.start('feat-1', '/project');
    mockChild.stdout.emit('data', Buffer.from('real process output\n'));

    service.appendLog('feat-1', 'synthetic agent line');

    const logs = service.getLogs('feat-1')!;
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ stream: 'stdout', line: 'real process output' });
    expect(logs[1]).toMatchObject({ stream: 'stdout', line: 'synthetic agent line' });
  });

  it("emits the 'log' event so SSE consumers stream the synthetic line", () => {
    const handler = vi.fn();
    service.on('log', handler);
    service.setTransientState('feat-1', '/project', 'feature', DeploymentState.Installing);

    service.appendLog('feat-1', 'installing dependencies');

    expect(handler).toHaveBeenCalledOnce();
    const entry: LogEntry = handler.mock.calls[0][0];
    expect(entry).toMatchObject({
      targetId: 'feat-1',
      stream: 'stdout',
      line: 'installing dependencies',
    });
  });

  it('is a no-op when no entry exists for the target', () => {
    const handler = vi.fn();
    service.on('log', handler);

    service.appendLog('unknown-target', 'some line');

    expect(handler).not.toHaveBeenCalled();
    expect(service.getLogs('unknown-target')).toBeNull();
  });

  it('survives a transient state transition (buffer is adopted, not reset)', () => {
    service.setTransientState('feat-1', '/project', 'feature', DeploymentState.Analyzing);
    service.appendLog('feat-1', 'analyzing project');

    service.setTransientState('feat-1', '/project', 'feature', DeploymentState.Installing);
    service.appendLog('feat-1', 'installing dependencies');

    const logs = service.getLogs('feat-1')!;
    expect(logs.map((l) => l.line)).toEqual(['analyzing project', 'installing dependencies']);
  });
});
