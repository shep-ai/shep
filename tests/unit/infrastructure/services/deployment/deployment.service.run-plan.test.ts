// @vitest-environment node

/**
 * DeploymentService Run-Plan Override Tests
 *
 * Tests for start() with an explicit RunPlanOverride (spec 103, task-4):
 * - runPlan spawns exactly the given command in the given cwd
 * - detectDevScript is never consulted when a runPlan is present
 * - runPlan.env is merged AFTER env scrubbing (custom vars survive, creds don't)
 * - start() never performs a blocking dependency install (installation is the
 *   dev-server-agent graph's job now)
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type childProcess from 'node:child_process';
import { execFileSync } from 'node:child_process';
import {
  DeploymentService,
  type DeploymentServiceDeps,
} from '@/infrastructure/services/deployment/deployment.service.js';
import { DeploymentState } from '@/domain/generated/output.js';

// Partial-mock child_process so we can prove start() never shells out to a
// blocking install (execFileSync) — spawn injection alone can't see that.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  return { ...actual, execFileSync: vi.fn() };
});

const mockExecFileSync = vi.mocked(execFileSync);

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

describe('DeploymentService — runPlan override', () => {
  let service: DeploymentService;
  let deps: DeploymentServiceDeps;
  let mockChild: ReturnType<typeof createMockChild>;

  beforeEach(() => {
    mockExecFileSync.mockClear();
    mockChild = createMockChild();
    deps = createMockDeps(mockChild);
    service = new DeploymentService(deps);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spawns exactly the runPlan command in the runPlan cwd (shell, platform opts)', () => {
    service.start('feature-1', '/project/path', 'repository', {
      runPlan: { command: 'cargo run --bin api', cwd: '/project/path/api' },
    });

    const isWindows = process.platform === 'win32';
    expect(deps.spawn).toHaveBeenCalledTimes(1);
    expect(deps.spawn).toHaveBeenCalledWith(
      'cargo run --bin api',
      expect.objectContaining({
        shell: true,
        cwd: '/project/path/api',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(isWindows ? { windowsHide: true } : { detached: true }),
      })
    );
  });

  it('never calls detectDevScript when a runPlan is provided', () => {
    service.start('feature-1', '/project/path', 'repository', {
      runPlan: { command: 'python manage.py runserver', cwd: '/project/path' },
    });

    expect(deps.detectDevScript).not.toHaveBeenCalled();
  });

  it('tracks the runPlan deployment as Booting and still detects the port from output', () => {
    service.start('feature-1', '/project/path', 'repository', {
      runPlan: { command: 'bun run dev', cwd: '/project/path' },
    });

    expect(service.getStatus('feature-1')).toEqual({
      state: DeploymentState.Booting,
      url: null,
    });

    mockChild.stdout.emit('data', Buffer.from('  Local:   http://localhost:3000/\n'));

    expect(service.getStatus('feature-1')).toEqual({
      state: DeploymentState.Ready,
      url: 'http://localhost:3000/',
    });
  });

  it('merges runPlan.env AFTER scrubbing — custom vars survive, cli-only creds do not', () => {
    const prevApiKey = process.env.ANTHROPIC_API_KEY;
    const prevOauth = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const prevPrefix = process.env.NEXT_ASSET_PREFIX;
    process.env.ANTHROPIC_API_KEY = 'secret-key';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'secret-token';
    process.env.NEXT_ASSET_PREFIX = '/cli';
    try {
      service.start('feature-1', '/project/path', 'repository', {
        runPlan: {
          command: 'npm run dev',
          cwd: '/project/path',
          env: { MY_CUSTOM_VAR: 'hello', PORT: '4111' },
        },
      });

      const spawnCall = (deps.spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const env = spawnCall[1].env as NodeJS.ProcessEnv;
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
      expect(env.NEXT_ASSET_PREFIX).toBeUndefined();
      // Overrides are applied after the blocklist scrub, so they win.
      expect(env.MY_CUSTOM_VAR).toBe('hello');
      expect(env.PORT).toBe('4111');
      expect(env.SHEP_SKIP_RECOVERY).toBe('1');
    } finally {
      if (prevApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevApiKey;
      if (prevOauth === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      else process.env.CLAUDE_CODE_OAUTH_TOKEN = prevOauth;
      if (prevPrefix === undefined) delete process.env.NEXT_ASSET_PREFIX;
      else process.env.NEXT_ASSET_PREFIX = prevPrefix;
    }
  });

  it('throws when the runPlan spawn returns no pid', () => {
    const noPidChild = createMockChild();
    (noPidChild as { pid?: number }).pid = undefined;
    (deps.spawn as ReturnType<typeof vi.fn>).mockReturnValue(noPidChild);

    expect(() =>
      service.start('feature-1', '/project/path', 'repository', {
        runPlan: { command: 'npm run dev', cwd: '/project/path' },
      })
    ).toThrow('Failed to spawn dev server: no PID returned');
  });

  it('stops an existing deployment for the same target before spawning the runPlan', () => {
    service.start('feature-1', '/project/path');

    const secondChild = createMockChild();
    secondChild.pid = 54321;
    (deps.spawn as ReturnType<typeof vi.fn>).mockReturnValue(secondChild);

    service.start('feature-1', '/project/path', 'repository', {
      runPlan: { command: 'npm run dev', cwd: '/project/path' },
    });

    expect(deps.kill).toHaveBeenCalledWith(12345, 'SIGKILL');
    expect(service.getStatus('feature-1')).toEqual({
      state: DeploymentState.Booting,
      url: null,
    });
  });

  describe('no embedded install (spec 103 — installation is the graph responsibility)', () => {
    it('does not run any install when detection reports needsInstall: true', () => {
      (deps.detectDevScript as ReturnType<typeof vi.fn>).mockReturnValue({
        success: true,
        packageManager: 'npm',
        scriptName: 'dev',
        command: 'npm run dev',
        needsInstall: true,
        resolvedDir: '/project/path',
      });

      service.start('feature-1', '/project/path');

      // No blocking install — spawn is the ONLY process creation.
      expect(mockExecFileSync).not.toHaveBeenCalled();
      expect(deps.spawn).toHaveBeenCalledTimes(1);
      expect(deps.spawn).toHaveBeenCalledWith('npm', ['run', 'dev'], expect.any(Object));
    });

    it('does not run any install on the runPlan path either', () => {
      service.start('feature-1', '/project/path', 'repository', {
        runPlan: { command: 'pnpm dev', cwd: '/project/path' },
      });

      expect(mockExecFileSync).not.toHaveBeenCalled();
      expect(deps.spawn).toHaveBeenCalledTimes(1);
    });
  });
});
