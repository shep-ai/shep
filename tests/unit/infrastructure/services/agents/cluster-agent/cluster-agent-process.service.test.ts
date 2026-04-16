/**
 * ClusterAgentProcessService Unit Tests
 *
 * Tests for cluster agent worker process management.
 * Mocks child_process.fork and node:fs for isolation.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

vi.mock('node:child_process', () => ({
  fork: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await importOriginal()) as typeof import('node:fs');
  return {
    ...actual,
    mkdirSync: vi.fn(),
    openSync: vi.fn().mockReturnValue(42),
  };
});

import { fork } from 'node:child_process';
import { ClusterAgentProcessService } from '@/infrastructure/services/agents/cluster-agent/cluster-agent-process.service.js';

describe('ClusterAgentProcessService', () => {
  let service: ClusterAgentProcessService;
  const mockFork = vi.mocked(fork);

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClusterAgentProcessService();
  });

  describe('spawn', () => {
    it('should fork worker with correct cluster-id and run-id args', () => {
      const mockChild = {
        pid: 12345,
        disconnect: vi.fn(),
        unref: vi.fn(),
      } as unknown as ChildProcess;
      mockFork.mockReturnValueOnce(mockChild);

      const pid = service.spawn('cluster-abc', 'run-123');

      expect(pid).toBe(12345);
      expect(mockFork).toHaveBeenCalledWith(
        expect.stringContaining('cluster-agent-worker'),
        ['--cluster-id', 'cluster-abc', '--run-id', 'run-123'],
        expect.objectContaining({
          detached: true,
          stdio: ['ignore', 42, 42, 'ipc'],
        })
      );
    });

    it('should pass argocd options when provided', () => {
      const mockChild = {
        pid: 12345,
        disconnect: vi.fn(),
        unref: vi.fn(),
      } as unknown as ChildProcess;
      mockFork.mockReturnValueOnce(mockChild);

      service.spawn('cluster-abc', 'run-123', {
        argoCdEnabled: true,
        argoCdNamespace: 'custom-argocd',
      });

      expect(mockFork).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          '--cluster-id',
          'cluster-abc',
          '--run-id',
          'run-123',
          '--argocd-enabled',
          '--argocd-namespace',
          'custom-argocd',
        ]),
        expect.any(Object)
      );
    });

    it('should pass resume and thread-id options', () => {
      const mockChild = {
        pid: 12345,
        disconnect: vi.fn(),
        unref: vi.fn(),
      } as unknown as ChildProcess;
      mockFork.mockReturnValueOnce(mockChild);

      service.spawn('cluster-abc', 'run-123', {
        resume: true,
        threadId: 'thread-456',
      });

      expect(mockFork).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['--resume', '--thread-id', 'thread-456']),
        expect.any(Object)
      );
    });

    it('should disconnect and unref child process', () => {
      const mockChild = {
        pid: 12345,
        disconnect: vi.fn(),
        unref: vi.fn(),
      } as unknown as ChildProcess;
      mockFork.mockReturnValueOnce(mockChild);

      service.spawn('cluster-abc', 'run-123');

      expect(mockChild.disconnect).toHaveBeenCalled();
      expect(mockChild.unref).toHaveBeenCalled();
    });

    it('should throw when fork returns no PID', () => {
      const mockChild = {
        pid: undefined,
        disconnect: vi.fn(),
        unref: vi.fn(),
      } as unknown as ChildProcess;
      mockFork.mockReturnValueOnce(mockChild);

      expect(() => service.spawn('cluster-abc', 'run-123')).toThrow(
        'Failed to spawn cluster agent worker: no PID returned'
      );
    });
  });

  describe('isAlive', () => {
    it('should return true for a live PID', () => {
      // process.kill(pid, 0) does not throw for live processes
      const spy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      expect(service.isAlive(12345)).toBe(true);
      expect(spy).toHaveBeenCalledWith(12345, 0);

      spy.mockRestore();
    });

    it('should return false for a dead PID', () => {
      const spy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      expect(service.isAlive(99999)).toBe(false);

      spy.mockRestore();
    });
  });

  describe('kill', () => {
    it('should send SIGTERM to the process', () => {
      const spy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      service.kill(12345);

      expect(spy).toHaveBeenCalledWith(12345, 'SIGTERM');

      spy.mockRestore();
    });

    it('should not throw when process is already dead', () => {
      const spy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      expect(() => service.kill(99999)).not.toThrow();

      spy.mockRestore();
    });
  });
});
