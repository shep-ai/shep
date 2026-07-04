// @vitest-environment node

/**
 * DeploymentService Log Accumulation Tests
 *
 * Tests for the log ring buffer integration, EventEmitter notification,
 * and buffer clearing on stop/stopAll/exit.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('DeploymentService — log accumulation', () => {
  let service: DeploymentService;
  let deps: DeploymentServiceDeps;
  let mockChild: ReturnType<typeof createMockChild>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockChild = createMockChild();
    deps = createMockDeps(mockChild);
    service = new DeploymentService(deps);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getLogs', () => {
    it('should return null for unknown targetId', () => {
      expect(service.getLogs('unknown')).toBeNull();
    });

    it('should return empty array when deployment has no output yet', () => {
      service.start('feat-1', '/project');
      const logs = service.getLogs('feat-1');
      expect(logs).toEqual([]);
    });

    it('should accumulate stdout lines as LogEntry with stream="stdout"', () => {
      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('hello world\n'));

      const logs = service.getLogs('feat-1')!;
      expect(logs).toHaveLength(1);
      expect(logs[0].stream).toBe('stdout');
      expect(logs[0].line).toBe('hello world');
      expect(logs[0].timestamp).toBeTypeOf('number');
    });

    it('should accumulate stderr lines as LogEntry with stream="stderr"', () => {
      service.start('feat-1', '/project');
      mockChild.stderr.emit('data', Buffer.from('error occurred\n'));

      const logs = service.getLogs('feat-1')!;
      expect(logs).toHaveLength(1);
      expect(logs[0].stream).toBe('stderr');
      expect(logs[0].line).toBe('error occurred');
    });

    it('should accumulate multiple lines from a single chunk', () => {
      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('line 1\nline 2\nline 3\n'));

      const logs = service.getLogs('feat-1')!;
      expect(logs).toHaveLength(3);
      expect(logs[0].line).toBe('line 1');
      expect(logs[1].line).toBe('line 2');
      expect(logs[2].line).toBe('line 3');
    });

    it('should interleave stdout and stderr in chronological order', () => {
      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('stdout first\n'));
      mockChild.stderr.emit('data', Buffer.from('stderr second\n'));
      mockChild.stdout.emit('data', Buffer.from('stdout third\n'));

      const logs = service.getLogs('feat-1')!;
      expect(logs).toHaveLength(3);
      expect(logs[0]).toMatchObject({ stream: 'stdout', line: 'stdout first' });
      expect(logs[1]).toMatchObject({ stream: 'stderr', line: 'stderr second' });
      expect(logs[2]).toMatchObject({ stream: 'stdout', line: 'stdout third' });
    });

    it('should handle partial lines across chunks', () => {
      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('partial'));
      // No newline yet — no complete line captured
      expect(service.getLogs('feat-1')!).toHaveLength(0);

      mockChild.stdout.emit('data', Buffer.from(' line\n'));
      const logs = service.getLogs('feat-1')!;
      expect(logs).toHaveLength(1);
      expect(logs[0].line).toBe('partial line');
    });
  });

  describe('EventEmitter (on/off)', () => {
    it('should emit "log" event for each new stdout line', () => {
      const handler = vi.fn();
      service.on('log', handler);

      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('hello\n'));

      expect(handler).toHaveBeenCalledOnce();
      const entry: LogEntry = handler.mock.calls[0][0];
      expect(entry.stream).toBe('stdout');
      expect(entry.line).toBe('hello');
    });

    it('should emit "log" event for each new stderr line', () => {
      const handler = vi.fn();
      service.on('log', handler);

      service.start('feat-1', '/project');
      mockChild.stderr.emit('data', Buffer.from('error\n'));

      expect(handler).toHaveBeenCalledOnce();
      const entry: LogEntry = handler.mock.calls[0][0];
      expect(entry.stream).toBe('stderr');
      expect(entry.line).toBe('error');
    });

    it('should emit multiple events for multiple lines in a chunk', () => {
      const handler = vi.fn();
      service.on('log', handler);

      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('a\nb\nc\n'));

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should not emit for incomplete lines (no newline)', () => {
      const handler = vi.fn();
      service.on('log', handler);

      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('no newline'));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should stop receiving events after off()', () => {
      const handler = vi.fn();
      service.on('log', handler);
      service.off('log', handler);

      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('hello\n'));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('buffer clearing', () => {
    it('should clear logs when stop() is called', async () => {
      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('some output\n'));
      expect(service.getLogs('feat-1')!).toHaveLength(1);

      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const stopPromise = service.stop('feat-1');
      await vi.advanceTimersByTimeAsync(300);
      mockChild.emit('exit', 0, null);
      await stopPromise;

      // After stop + exit, deployment is removed so getLogs returns null
      expect(service.getLogs('feat-1')).toBeNull();
    });

    it('should clear logs when stopAll() is called', () => {
      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('some output\n'));

      service.stopAll();
      // After stopAll + close event, deployment is removed
      mockChild.emit('close', null, 'SIGKILL');

      expect(service.getLogs('feat-1')).toBeNull();
    });

    // Spec 103 (task-15): a spontaneous exit RETAINS the log buffer as a
    // post-mortem trail — the dev-server-agent graph reports verify/remediate
    // progress and the terminal failure reason AFTER the process crashed, and
    // users must be able to read why a server died. The trail is dismissed
    // when a new lifecycle begins (start) or on explicit stop/stopAll.
    it('should retain logs as a post-mortem when the process exits spontaneously', () => {
      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('some output\n'));

      mockChild.emit('close', 1, null);

      const retained = service.getLogs('feat-1')!;
      expect(retained.map((l) => l.line)).toEqual(['some output']);

      // Synthetic lines (agent failure reasons) still land in the retained
      // trail and are visible to late readers.
      service.appendLog('feat-1', 'dev server crashed: reason');
      expect(service.getLogs('feat-1')!.map((l) => l.line)).toEqual([
        'some output',
        'dev server crashed: reason',
      ]);

      // A fresh start dismisses the previous run's trail.
      const nextChild = createMockChild();
      (deps.spawn as ReturnType<typeof vi.fn>).mockReturnValue(nextChild);
      service.start('feat-1', '/project');
      expect(service.getLogs('feat-1')).toEqual([]);
    });
  });

  describe('port detection still works', () => {
    it('should still detect port from stdout and transition to Ready', () => {
      service.start('feat-1', '/project');
      mockChild.stdout.emit('data', Buffer.from('  Local:   http://localhost:3000/\n'));

      const status = service.getStatus('feat-1');
      expect(status?.state).toBe(DeploymentState.Ready);
      expect(status?.url).toBe('http://localhost:3000/');
    });

    it('should still detect port from stderr', () => {
      service.start('feat-1', '/project');
      mockChild.stderr.emit('data', Buffer.from('Server listening on port 8080\n'));

      const status = service.getStatus('feat-1');
      expect(status?.state).toBe(DeploymentState.Ready);
      expect(status?.url).toBe('http://localhost:8080');
    });

    it('should accumulate log lines even after port detection', () => {
      service.start('feat-1', '/project');
      // This line triggers port detection
      mockChild.stdout.emit('data', Buffer.from('  Local:   http://localhost:3000/\n'));
      // These lines come after
      mockChild.stdout.emit('data', Buffer.from('Ready in 500ms\n'));

      const logs = service.getLogs('feat-1')!;
      expect(logs).toHaveLength(2);
      expect(logs[0].line).toBe('  Local:   http://localhost:3000/');
      expect(logs[1].line).toBe('Ready in 500ms');
    });
  });
});
