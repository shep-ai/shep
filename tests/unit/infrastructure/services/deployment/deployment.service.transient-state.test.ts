// @vitest-environment node

/**
 * DeploymentService Transient State Tests
 *
 * Tests for setTransientState() (spec 103, task-4): externally-driven
 * pre-spawn states (Analyzing / Installing) surfaced by the dev-server-agent
 * graph so polling/SSE can show progress before any process exists.
 *
 * Invariants:
 * - Transient entries are in-memory ONLY — never persisted to dev_servers
 *   (same rationale as Booting: a child shep sharing ~/.shep/data must not
 *   see them during recovery).
 * - Transient entries have no process — liveness validation must not clean
 *   them up, stop() must not kill anything, and a subsequent start() for the
 *   same targetId simply replaces them.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type Database from 'better-sqlite3';
import {
  DeploymentService,
  type DeploymentServiceDeps,
} from '@/infrastructure/services/deployment/deployment.service.js';
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
      needsInstall: false,
      resolvedDir: _dirPath,
    })),
    kill: vi.fn(),
    isAlive: vi.fn().mockReturnValue(true),
  };
}

function createMockDb() {
  const run = vi.fn();
  const prepare = vi.fn().mockReturnValue({
    all: vi.fn().mockReturnValue([]),
    run,
    get: vi.fn().mockReturnValue(undefined),
  });
  return {
    db: { prepare } as unknown as Database.Database,
    prepare,
  };
}

describe('DeploymentService — transient states (Analyzing / Installing)', () => {
  let service: DeploymentService;
  let deps: DeploymentServiceDeps;
  let mockChild: ReturnType<typeof createMockChild>;

  beforeEach(() => {
    mockChild = createMockChild();
    deps = createMockDeps(mockChild);
    service = new DeploymentService(deps);
  });

  describe('visibility', () => {
    it('surfaces an Analyzing entry via getStatus', () => {
      service.setTransientState('feature-1', '/project/path', 'feature', DeploymentState.Analyzing);

      expect(service.getStatus('feature-1')).toEqual({
        state: DeploymentState.Analyzing,
        url: null,
      });
    });

    it('surfaces an Installing entry via listAll with targetId and targetType', () => {
      service.setTransientState('repo-1', '/repos/one', 'repository', DeploymentState.Installing);

      expect(service.listAll()).toEqual([
        {
          targetId: 'repo-1',
          targetType: 'repository',
          state: DeploymentState.Installing,
          url: null,
        },
      ]);
    });

    it('transitions Analyzing → Installing on a subsequent call for the same target', () => {
      service.setTransientState('feature-1', '/project/path', 'feature', DeploymentState.Analyzing);
      service.setTransientState(
        'feature-1',
        '/project/path',
        'feature',
        DeploymentState.Installing
      );

      expect(service.getStatus('feature-1')).toEqual({
        state: DeploymentState.Installing,
        url: null,
      });
      expect(service.listAll()).toHaveLength(1);
    });
  });

  describe('persistence (never written to dev_servers)', () => {
    it('does not persist transient entries to the database', () => {
      const { db, prepare } = createMockDb();
      service.setDatabase(db);

      service.setTransientState('feature-1', '/project/path', 'feature', DeploymentState.Analyzing);
      service.getStatus('feature-1');
      service.listAll();

      const insertCalls = prepare.mock.calls.filter(([sql]) => /INSERT/i.test(String(sql)));
      expect(insertCalls).toEqual([]);
    });
  });

  describe('liveness validation', () => {
    it('does not treat a transient entry as dead in getStatus (no pid to probe)', () => {
      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);

      service.setTransientState('feature-1', '/project/path', 'feature', DeploymentState.Analyzing);

      expect(service.getStatus('feature-1')).toEqual({
        state: DeploymentState.Analyzing,
        url: null,
      });
    });

    it('does not clean up a transient entry in listAll', () => {
      (deps.isAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);

      service.setTransientState('repo-1', '/repos/one', 'repository', DeploymentState.Installing);

      expect(service.listAll()).toEqual([
        {
          targetId: 'repo-1',
          targetType: 'repository',
          state: DeploymentState.Installing,
          url: null,
        },
      ]);
      // Still there on a second pass
      expect(service.getStatus('repo-1')).not.toBeNull();
    });
  });

  describe('clearing rules', () => {
    it('is replaced by a subsequent start() for the same targetId without killing anything', () => {
      service.setTransientState('feature-1', '/project/path', 'feature', DeploymentState.Analyzing);

      service.start('feature-1', '/project/path', 'feature');

      expect(deps.kill).not.toHaveBeenCalled();
      expect(service.getStatus('feature-1')).toEqual({
        state: DeploymentState.Booting,
        url: null,
      });
      expect(service.listAll()).toHaveLength(1);
    });

    it('stop() on a transient entry just removes it — no kill, no process wait', async () => {
      service.setTransientState(
        'feature-1',
        '/project/path',
        'feature',
        DeploymentState.Installing
      );

      await service.stop('feature-1');

      expect(deps.kill).not.toHaveBeenCalled();
      expect(service.getStatus('feature-1')).toBeNull();
    });

    it('stopAll() removes transient entries without killing pid 0', () => {
      service.setTransientState('feature-1', '/project/path', 'feature', DeploymentState.Analyzing);

      service.stopAll();

      expect(deps.kill).not.toHaveBeenCalled();
      expect(service.getStatus('feature-1')).toBeNull();
    });

    it('setTransientState over a live deployment stops the old process first', () => {
      service.start('feature-1', '/project/path', 'feature');

      service.setTransientState('feature-1', '/project/path', 'feature', DeploymentState.Analyzing);

      expect(deps.kill).toHaveBeenCalledWith(12345, 'SIGKILL');
      expect(service.getStatus('feature-1')).toEqual({
        state: DeploymentState.Analyzing,
        url: null,
      });
    });
  });
});
