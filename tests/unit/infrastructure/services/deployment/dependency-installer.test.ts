// @vitest-environment node

/**
 * DependencyInstaller Unit Tests
 *
 * Async, log-streamed, non-blocking package install. Uses dependency
 * injection for child_process.spawn to enable unit testing without
 * touching the real filesystem or process table.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  DependencyInstaller,
  type DependencyInstallerDeps,
  type InstallResult,
} from '@/infrastructure/services/deployment/dependency-installer.js';

type MockChild = EventEmitter & {
  pid: number;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
};

function createMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.pid = 4242;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  child.killed = false;
  return child;
}

/** No-op onLogLine callback for tests that don't assert on captured lines. */
function noop(): void {
  // intentionally empty
}

describe('DependencyInstaller', () => {
  let mockChild: MockChild;
  let spawnMock: ReturnType<typeof vi.fn>;
  let deps: DependencyInstallerDeps;

  beforeEach(() => {
    mockChild = createMockChild();
    spawnMock = vi.fn().mockReturnValue(mockChild);
    deps = { spawn: spawnMock as unknown as DependencyInstallerDeps['spawn'] };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('non-interactive arg matrix per package manager', () => {
    it.each([
      ['npm', ['install', '--no-audit', '--no-fund']],
      ['pnpm', ['install']],
      ['yarn', ['install', '--non-interactive']],
      ['bun', ['install']],
      ['some-unknown-pm', ['install']],
    ])('uses %s-appropriate non-interactive args', (pm, expectedArgs) => {
      const installer = new DependencyInstaller(deps);
      void installer.install('/repo', pm, noop);

      expect(spawnMock).toHaveBeenCalledWith(
        pm,
        expectedArgs,
        expect.objectContaining({
          shell: true,
          cwd: '/repo',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      );

      mockChild.emit('close', 0, null);
    });
  });

  it('applies windowsHide only on win32', () => {
    const installer = new DependencyInstaller(deps);
    void installer.install('/repo', 'npm', noop);

    const opts = spawnMock.mock.calls[0][2];
    if (process.platform === 'win32') {
      expect(opts.windowsHide).toBe(true);
    } else {
      expect(opts.windowsHide).toBeUndefined();
    }
    mockChild.emit('close', 0, null);
  });

  it('scrubs ANTHROPIC/PORT/NEXT_ASSET_PREFIX creds and sets CI=1', () => {
    const scrubbedKeys = [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'PORT',
      'NEXT_ASSET_PREFIX',
    ] as const;
    const saved: Record<string, string | undefined> = {};
    for (const key of scrubbedKeys) saved[key] = process.env[key];
    process.env.ANTHROPIC_API_KEY = 'secret-key';
    process.env.ANTHROPIC_AUTH_TOKEN = 'secret-auth';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'secret-oauth';
    process.env.PORT = '3000';
    process.env.NEXT_ASSET_PREFIX = '/cli';

    try {
      const installer = new DependencyInstaller(deps);
      void installer.install('/repo', 'npm', noop);

      const env = spawnMock.mock.calls[0][2].env as NodeJS.ProcessEnv;
      for (const key of scrubbedKeys) {
        expect(env[key]).toBeUndefined();
      }
      expect(env.CI).toBe('1');

      mockChild.emit('close', 0, null);
    } finally {
      for (const key of scrubbedKeys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  });

  it('streams stdout/stderr lines to onLogLine as they complete', async () => {
    const lines: string[] = [];
    const installer = new DependencyInstaller(deps);
    const resultPromise = installer.install('/repo', 'npm', (line) => lines.push(line));

    mockChild.stdout.emit('data', Buffer.from('added 10 packages\n'));
    mockChild.stderr.emit('data', Buffer.from('warn deprecated pkg\n'));
    mockChild.emit('close', 0, null);

    const result = await resultPromise;
    expect(lines).toContain('added 10 packages');
    expect(lines).toContain('warn deprecated pkg');
    expect(result.success).toBe(true);
  });

  it('flushes a trailing partial line (no newline) on close', async () => {
    const lines: string[] = [];
    const installer = new DependencyInstaller(deps);
    const resultPromise = installer.install('/repo', 'npm', (line) => lines.push(line));

    mockChild.stdout.emit('data', Buffer.from('no trailing newline'));
    mockChild.emit('close', 0, null);

    await resultPromise;
    expect(lines).toContain('no trailing newline');
  });

  it('resolves success:true with exitCode 0 on a clean close', async () => {
    const installer = new DependencyInstaller(deps);
    const resultPromise = installer.install('/repo', 'npm', noop);
    mockChild.emit('close', 0, null);

    const result: InstallResult = await resultPromise;
    expect(result).toEqual({ success: true, exitCode: 0, tail: [] });
  });

  it('resolves success:false with the exit code on a non-zero close', async () => {
    const installer = new DependencyInstaller(deps);
    const resultPromise = installer.install('/repo', 'npm', noop);
    mockChild.stderr.emit('data', Buffer.from('npm ERR! something broke\n'));
    mockChild.emit('close', 1, null);

    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.tail).toContain('npm ERR! something broke');
  });

  it('never rejects — a spawn "error" event resolves with failure instead', async () => {
    const installer = new DependencyInstaller(deps);
    const resultPromise = installer.install('/repo', 'npm', noop);

    mockChild.emit('error', new Error('ENOENT: npm not found on PATH'));

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({ success: false, exitCode: null })
    );
    const result = await resultPromise;
    expect(result.tail.some((l) => l.includes('ENOENT: npm not found on PATH'))).toBe(true);
  });

  it('caps the captured tail at the last 50 lines', async () => {
    const installer = new DependencyInstaller(deps);
    const resultPromise = installer.install('/repo', 'npm', noop);

    for (let i = 0; i < 60; i++) {
      mockChild.stdout.emit('data', Buffer.from(`line-${i}\n`));
    }
    mockChild.emit('close', 0, null);

    const result = await resultPromise;
    expect(result.tail).toHaveLength(50);
    expect(result.tail[0]).toBe('line-10');
    expect(result.tail[49]).toBe('line-59');
  });

  it('kills the child with SIGKILL and resolves failure on timeout', async () => {
    vi.useFakeTimers();
    const installer = new DependencyInstaller(deps);
    const resultPromise = installer.install('/repo', 'npm', noop, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');
    expect(result.success).toBe(false);
    expect(result.exitCode).toBeNull();
    expect(result.tail.some((l) => l.toLowerCase().includes('timed out'))).toBe(true);
  });

  it('does not fire the timeout after the process already closed', async () => {
    vi.useFakeTimers();
    const installer = new DependencyInstaller(deps);
    const resultPromise = installer.install('/repo', 'npm', noop, 1000);

    mockChild.emit('close', 0, null);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(mockChild.kill).not.toHaveBeenCalled();
  });

  it('defaults the timeout to 10 minutes when not provided', async () => {
    vi.useFakeTimers();
    const installer = new DependencyInstaller(deps);
    const resultPromise = installer.install('/repo', 'npm', noop);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 - 1);
    expect(mockChild.kill).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    const result = await resultPromise;
    expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');
    expect(result.success).toBe(false);
  });
});
