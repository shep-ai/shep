// @vitest-environment node

/**
 * DeploymentService Unit Tests
 *
 * Tests for the deployment lifecycle service: start, stop, getStatus, stopAll.
 * Uses dependency injection for child_process.spawn to enable unit testing.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type fs from 'node:fs';
import { existsSync } from 'node:fs';
import {
  DeploymentService,
  type DeploymentServiceDeps,
} from '@/infrastructure/services/deployment/deployment.service.js';
import { DeploymentState } from '@/domain/generated/output.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, existsSync: vi.fn(actual.existsSync) };
});

const mockExistsSync = vi.mocked(existsSync);

/**
 * Create a mock ChildProcess that emits events and has controllable streams.
 */
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
      needsInstall: false,
      resolvedDir: _dirPath,
    })),
    kill: vi.fn(),
    isAlive: vi.fn().mockReturnValue(true),
  };
}

describe('DeploymentService', () => {
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

  describe('start', () => {
    it('should call spawn with correct args (shell, cwd, platform-specific options)', () => {
      service.start('feature-1', '/project/path');

      const isWindows = process.platform === 'win32';
      expect(deps.spawn).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev'],
        expect.objectContaining({
          shell: true,
          cwd: '/project/path',
          stdio: ['ignore', 'pipe', 'pipe'],
          ...(isWindows ? { windowsHide: true } : { detached: true }),
        })
      );
    });

    it('should scrub cli-only env vars (NEXT_ASSET_PREFIX, PORT) from the spawned dev server', () => {
      const prevPrefix = process.env.NEXT_ASSET_PREFIX;
      const prevPort = process.env.PORT;
      process.env.NEXT_ASSET_PREFIX = '/cli';
      process.env.PORT = '3000';
      try {
        service.start('feature-1', '/project/path');

        const spawnCall = (deps.spawn as ReturnType<typeof vi.fn>).mock.calls[0];
        const env = spawnCall[2].env as NodeJS.ProcessEnv;
        expect(env.NEXT_ASSET_PREFIX).toBeUndefined();
        expect(env.PORT).toBeUndefined();
        // Still wires through the recovery guard.
        expect(env.SHEP_SKIP_RECOVERY).toBe('1');
      } finally {
        if (prevPrefix === undefined) delete process.env.NEXT_ASSET_PREFIX;
        else process.env.NEXT_ASSET_PREFIX = prevPrefix;
        if (prevPort === undefined) delete process.env.PORT;
        else process.env.PORT = prevPort;
      }
    });

    it('should store entry in Map with Booting state', () => {
      service.start('feature-1', '/project/path');

      const status = service.getStatus('feature-1');
      expect(status).toEqual({
        state: DeploymentState.Booting,
        url: null,
      });
    });

    it('should stop existing deployment for same targetId before spawning new one', () => {
      // Start first deployment
      service.start('feature-1', '/project/path');

      // Create a second mock child for the replacement
      const secondChild = createMockChild();
      secondChild.pid = 54321;
      (deps.spawn as ReturnType<typeof vi.fn>).mockReturnValue(secondChild);

      // Start second deployment for same target — should stop first
      service.start('feature-1', '/project/path');

      // The first process should have been killed (tree-kill uses positive PID)
      expect(deps.kill).toHaveBeenCalledWith(12345, 'SIGKILL');

      // Status should reflect the new deployment
      const status = service.getStatus('feature-1');
      expect(status).toEqual({
        state: DeploymentState.Booting,
        url: null,
      });
    });

    it('should use pnpm command format when detected', () => {
      (deps.detectDevScript as ReturnType<typeof vi.fn>).mockReturnValue({
        success: true,
        packageManager: 'pnpm',
        scriptName: 'dev',
        command: 'pnpm dev',
        resolvedDir: '/project/path',
      });

      service.start('feature-1', '/project/path');

      expect(deps.spawn).toHaveBeenCalledWith('pnpm', ['dev'], expect.any(Object));
    });

    it('should use resolvedDir from detectDevScript as spawn cwd', () => {
      (deps.detectDevScript as ReturnType<typeof vi.fn>).mockReturnValue({
        success: true,
        packageManager: 'npm',
        scriptName: 'dev',
        command: 'npm run dev',
        needsInstall: false,
        resolvedDir: '/worktree/site',
      });

      service.start('feature-1', '/worktree');

      expect(deps.spawn).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev'],
        expect.objectContaining({
          cwd: '/worktree/site',
        })
      );
    });

    it('should throw when detectDevScript fails', () => {
      (deps.detectDevScript as ReturnType<typeof vi.fn>).mockReturnValue({
        success: false,
        error: 'No package.json found',
      });

      expect(() => service.start('feature-1', '/project/path')).toThrow('No package.json found');
    });

    it('should throw when spawn returns no pid', () => {
      const noPidChild = createMockChild();
      (noPidChild as any).pid = undefined;
      (deps.spawn as ReturnType<typeof vi.fn>).mockReturnValue(noPidChild);

      expect(() => service.start('feature-1', '/project/path')).toThrow(
        'Failed to spawn dev server: no PID returned'
      );
    });
  });

  describe('stdout port detection', () => {
    it('should transition state to Ready when parsePort matches', () => {
      service.start('feature-1', '/project/path');

      // Simulate stdout data with a URL
      mockChild.stdout.emit('data', Buffer.from('  Local:   http://localhost:3000/\n'));

      const status = service.getStatus('feature-1');
      expect(status).toEqual({
        state: DeploymentState.Ready,
        url: 'http://localhost:3000/',
      });
    });

    it('should not transition on non-matching stdout output', () => {
      service.start('feature-1', '/project/path');

      mockChild.stdout.emit('data', Buffer.from('Compiling...\n'));

      const status = service.getStatus('feature-1');
      expect(status).toEqual({
        state: DeploymentState.Booting,
        url: null,
      });
    });

    it('should handle partial lines across chunks', () => {
      service.start('feature-1', '/project/path');

      // First chunk: partial line
      mockChild.stdout.emit('data', Buffer.from('  Local:   http://local'));
      expect(service.getStatus('feature-1')?.state).toBe(DeploymentState.Booting);

      // Second chunk: rest of line with newline
      mockChild.stdout.emit('data', Buffer.from('host:3000/\n'));
      expect(service.getStatus('feature-1')?.state).toBe(DeploymentState.Ready);
      expect(service.getStatus('feature-1')?.url).toBe('http://localhost:3000/');
    });

    it('should detect port from stderr as well', () => {
      service.start('feature-1', '/project/path');

      mockChild.stderr.emit('data', Buffer.from('Server listening on port 8080\n'));

      const status = service.getStatus('feature-1');
      expect(status).toEqual({
        state: DeploymentState.Ready,
        url: 'http://localhost:8080',
      });
    });
  });

  describe('getStatus', () => {
    it('should return state and url for tracked deployment', () => {
      service.start('feature-1', '/project/path');

      const status = service.getStatus('feature-1');
      expect(status).toEqual({
        state: DeploymentState.Booting,
        url: null,
      });
    });

    it('should return null for unknown targetId', () => {
      const status = service.getStatus('unknown-id');
      expect(status).toBeNull();
    });
  });

  describe('listAll', () => {
    it('should return empty array when no deployments are tracked', () => {
      expect(service.listAll()).toEqual([]);
    });

    it('should return one entry per tracked deployment with targetId and targetType', () => {
      const secondChild = createMockChild();
      secondChild.pid = 22222;
      (deps.spawn as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(mockChild)
        .mockReturnValueOnce(secondChild);

      service.start('feature-1', '/project/one', 'feature');
      service.start('/repos/two', '/repos/two', 'repository');

      const all = service.listAll();

      expect(all).toHaveLength(2);
      expect(all).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            targetId: 'feature-1',
            targetType: 'feature',
            state: DeploymentState.Booting,
            url: null,
          }),
          expect.objectContaining({
            targetId: '/repos/two',
            targetType: 'repository',
            state: DeploymentState.Booting,
            url: null,
          }),
        ])
      );
    });

    it('should omit and clean up deployments whose process is dead', () => {
      service.start('feature-1', '/project/path', 'feature');

      // Process died externally
      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);

      expect(service.listAll()).toEqual([]);
      // Subsequent getStatus should confirm cleanup
      expect(service.getStatus('feature-1')).toBeNull();
    });
  });

  describe('stop', () => {
    it('should send SIGTERM to process tree via tree-kill (positive PID)', async () => {
      service.start('feature-1', '/project/path');

      // After SIGTERM, process dies
      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const stopPromise = service.stop('feature-1');

      // Advance timers to let pollUntilDead complete (isAlive returns false)
      await vi.advanceTimersByTimeAsync(300);

      // Simulate process exit
      mockChild.emit('exit', 0, null);

      await stopPromise;

      expect(deps.kill).toHaveBeenCalledWith(12345, 'SIGTERM');
    });

    it('should send SIGKILL after timeout if process still alive', async () => {
      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(true);

      service.start('feature-1', '/project/path');

      const stopPromise = service.stop('feature-1');

      // Advance through polling interval + timeout
      // The stop method polls every 200ms for 5000ms
      await vi.advanceTimersByTimeAsync(5200);

      // Process finally exits after SIGKILL
      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);
      mockChild.emit('exit', null, 'SIGKILL');

      await stopPromise;

      expect(deps.kill).toHaveBeenCalledWith(12345, 'SIGTERM');
      expect(deps.kill).toHaveBeenCalledWith(12345, 'SIGKILL');
    });

    it('should resolve immediately for unknown targetId', async () => {
      await service.stop('unknown-id');
      expect(deps.kill).not.toHaveBeenCalled();
    });

    it('should remove entry from map after process exits', async () => {
      service.start('feature-1', '/project/path');

      // After SIGTERM, process dies
      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const stopPromise = service.stop('feature-1');

      // Advance timers to let pollUntilDead complete (isAlive returns false)
      await vi.advanceTimersByTimeAsync(300);

      // Simulate process exit
      mockChild.emit('exit', 0, null);

      await stopPromise;

      expect(service.getStatus('feature-1')).toBeNull();
    });
  });

  describe('process exit handler', () => {
    it('should remove entry from Map when process exits spontaneously', () => {
      service.start('feature-1', '/project/path');
      expect(service.getStatus('feature-1')).not.toBeNull();

      // Process closes on its own (e.g., crash) — 'close' fires after stdio drained
      mockChild.emit('close', 1, null);

      expect(service.getStatus('feature-1')).toBeNull();
    });
  });

  describe('stopAll', () => {
    it('should terminate all tracked deployments', async () => {
      // Start two deployments
      service.start('feature-1', '/project/path');

      const secondChild = createMockChild();
      secondChild.pid = 99999;
      (deps.spawn as ReturnType<typeof vi.fn>).mockReturnValue(secondChild);
      service.start('feature-2', '/project/path2');

      service.stopAll();

      // Both process trees should have been killed (positive PIDs for tree-kill)
      expect(deps.kill).toHaveBeenCalledWith(12345, 'SIGKILL');
      expect(deps.kill).toHaveBeenCalledWith(99999, 'SIGKILL');
    });

    it('should clear the deployment map', () => {
      service.start('feature-1', '/project/path');

      service.stopAll();
      // Simulate close events after SIGKILL
      mockChild.emit('close', null, 'SIGKILL');

      expect(service.getStatus('feature-1')).toBeNull();
    });

    it('should handle empty map gracefully', () => {
      expect(() => service.stopAll()).not.toThrow();
    });
  });

  describe('port detection timeout', () => {
    it('should remain in Booting state after 30s timeout with no port detected', async () => {
      service.start('feature-1', '/project/path');

      // Advance past the 30-second port detection timeout
      await vi.advanceTimersByTimeAsync(31_000);

      const status = service.getStatus('feature-1');
      expect(status?.state).toBe(DeploymentState.Booting);
    });
  });

  describe('tree-kill integration', () => {
    it('should call kill with positive PID (not negative process group)', async () => {
      service.start('feature-1', '/project/path');

      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const stopPromise = service.stop('feature-1');
      await vi.advanceTimersByTimeAsync(300);
      mockChild.emit('exit', 0, null);
      await stopPromise;

      // Verify positive PID is used (tree-kill handles process tree internally)
      for (const call of (deps.kill as ReturnType<typeof vi.fn>).mock.calls) {
        expect(call[0]).toBeGreaterThan(0);
      }
    });

    it('should pass signal string to kill function', async () => {
      service.start('feature-1', '/project/path');

      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const stopPromise = service.stop('feature-1');
      await vi.advanceTimersByTimeAsync(300);
      mockChild.emit('exit', 0, null);
      await stopPromise;

      expect(deps.kill).toHaveBeenCalledWith(expect.any(Number), 'SIGTERM');
    });
  });

  describe('recoverAll', () => {
    let originalSkipRecovery: string | undefined;

    beforeEach(() => {
      originalSkipRecovery = process.env.SHEP_SKIP_RECOVERY;
      delete process.env.SHEP_SKIP_RECOVERY;
    });

    afterEach(() => {
      if (originalSkipRecovery !== undefined) {
        process.env.SHEP_SKIP_RECOVERY = originalSkipRecovery;
      }
    });

    function createMockDb(rows: Record<string, unknown>[]) {
      return {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(rows),
          run: vi.fn(),
          get: vi.fn(),
        }),
        // eslint-disable-next-line @typescript-eslint/consistent-type-imports
      } as unknown as import('better-sqlite3').Database;
    }

    function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        target_id: 'repo-1',
        target_type: 'repository',
        pid: 9999,
        state: DeploymentState.Ready,
        url: 'http://localhost:3000',
        target_path: '/project/path',
        started_at: Date.now(),
        ...overrides,
      };
    }

    it('should re-adopt alive process with Ready state and URL', () => {
      const db = createMockDb([makeRow()]);
      service.setDatabase(db);
      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(true);

      service.recoverAll();

      const status = service.getStatus('repo-1');
      expect(status).toEqual({ state: DeploymentState.Ready, url: 'http://localhost:3000' });
      // Should NOT have re-spawned (no spawn call beyond setup)
      expect(deps.spawn).not.toHaveBeenCalled();
    });

    it('should leave alive process stuck in Booting and clean DB entry', () => {
      const row = makeRow({ state: DeploymentState.Booting, url: null });
      const db = createMockDb([row]);
      service.setDatabase(db);
      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(true);
      mockExistsSync.mockReturnValue(true);

      service.recoverAll();

      // Should NOT have killed the orphan (it may belong to another shep instance)
      expect(deps.kill).not.toHaveBeenCalled();
      // Should NOT have re-spawned
      expect(deps.spawn).not.toHaveBeenCalled();
      // Should have cleaned up the DB entry
      expect(db.prepare).toHaveBeenCalledWith('DELETE FROM dev_servers WHERE target_id = ?');
    });

    it('should re-spawn dead process when target directory exists', () => {
      const row = makeRow({ state: DeploymentState.Ready });
      const db = createMockDb([row]);
      service.setDatabase(db);
      // First isAlive call: recovery check → false (dead PID triggers re-spawn)
      // After re-spawn, getStatus calls isAlive on the NEW pid → true
      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValueOnce(false).mockReturnValue(true);
      mockExistsSync.mockReturnValue(true);

      service.recoverAll();

      expect(deps.spawn).toHaveBeenCalled();
      expect(service.getStatus('repo-1')).not.toBeNull();
    });

    it('should skip re-spawn when target directory has no package.json', () => {
      const row = makeRow();
      const db = createMockDb([row]);
      service.setDatabase(db);
      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);
      mockExistsSync.mockReturnValue(false);

      service.recoverAll();

      expect(deps.spawn).not.toHaveBeenCalled();
    });

    it('should not block other recoveries when one re-spawn fails', () => {
      const rows = [
        makeRow({ target_id: 'repo-bad', target_path: '/bad/path' }),
        makeRow({ target_id: 'repo-good', target_path: '/good/path' }),
      ];
      const db = createMockDb(rows);
      service.setDatabase(db);
      // Recovery checks: both dead. After re-spawn of good one, getStatus → true
      (deps.isAlive as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(false) // repo-bad recovery check
        .mockReturnValueOnce(false) // repo-good recovery check
        .mockReturnValue(true); // subsequent getStatus calls
      mockExistsSync.mockReturnValue(true);

      // First call to detectDevScript fails, second succeeds
      (deps.detectDevScript as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: false, error: 'No package.json' })
        .mockReturnValueOnce({
          success: true,
          packageManager: 'npm',
          scriptName: 'dev',
          command: 'npm run dev',
          needsInstall: false,
          resolvedDir: '/good/path',
        });

      service.recoverAll();

      // The good one should still have been re-spawned
      expect(service.getStatus('repo-good')).not.toBeNull();
    });

    it('should handle empty database gracefully', () => {
      const db = createMockDb([]);
      service.setDatabase(db);

      expect(() => service.recoverAll()).not.toThrow();
    });
  });
});
