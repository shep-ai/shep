/**
 * status command unit tests
 *
 * Tests for the `shep status` CLI command.
 * Covers: not-running path, running path with metrics formatting, metrics fallback,
 * environment section, --logs flag.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Hoist mocks so factory closures can reference them
const {
  mockSampleStats,
  mockDaemonService,
  mockRenderDetailView,
  mockVersionService,
  mockCheckDaemonHealth,
} = vi.hoisted(() => {
  // CPU and memory come through SampleProcessStatsUseCase (spec 144).
  const mockSampleStats = { execute: vi.fn() };
  const mockDaemonService = {
    read: vi.fn(),
    write: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    isAlive: vi.fn(),
  };
  const mockRenderDetailView = vi.fn();
  const mockVersionService = {
    getVersion: vi.fn().mockReturnValue({
      version: '1.56.0',
      name: '@shepai/cli',
      description: 'Shep AI CLI',
    }),
    getBuildIdentity: vi.fn().mockReturnValue({
      cliVersion: '1.56.0',
      nodeVersion: 'v22.5.1',
      platform: 'linux',
      osRelease: '6.8.0-generic',
      arch: 'x64',
      gitSha: '3f9a1c2',
    }),
  };
  const mockCheckDaemonHealth = {
    execute: vi.fn().mockResolvedValue({
      daemonRunning: true,
      reachable: true,
      healthy: true,
      url: 'http://localhost:4050/api/health',
      httpStatus: 200,
      checks: [{ name: 'container', ok: true }],
      error: null,
      failingChecks: [],
      summary: 'Ready — 1 check(s) healthy (HTTP 200)',
    }),
  };
  return {
    mockSampleStats,
    mockDaemonService,
    mockRenderDetailView,
    mockVersionService,
    mockCheckDaemonHealth,
  };
});

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockImplementation((token: unknown) => {
      if (token === 'IDaemonService') return mockDaemonService;
      if (token === 'IVersionService') return mockVersionService;
      if (typeof token === 'function' && token.name === 'CheckDaemonHealthUseCase') {
        return mockCheckDaemonHealth;
      }
      if (typeof token === 'function' && token.name === 'SampleProcessStatsUseCase') {
        return mockSampleStats;
      }
      throw new Error(`Unknown token: ${String(token)}`);
    }),
  },
}));

vi.mock('../../../src/presentation/cli/ui/index.js', () => ({
  renderDetailView: mockRenderDetailView,
  messages: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    newline: vi.fn(),
  },
  colors: { muted: (s: string) => s, success: (s: string) => s },
  fmt: { code: (s: string) => s, heading: (s: string) => s },
}));

vi.mock('@/infrastructure/services/filesystem/shep-directory.service.js', () => ({
  getShepHomeDir: vi.fn().mockReturnValue('/home/test/.shep'),
  getShepDbPath: vi.fn().mockReturnValue('/home/test/.shep/data'),
  getDaemonStatePath: vi.fn().mockReturnValue('/home/test/.shep/daemon.json'),
  getDaemonLogPath: vi.fn().mockReturnValue('/home/test/.shep/daemon.log'),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    statSync: vi.fn().mockReturnValue({ size: 0 }),
  };
});

import { createStatusCommand } from '../../../src/presentation/cli/commands/status.command.js';

describe('status command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Default: 1.5% CPU, 102400 KiB resident
    mockSampleStats.execute.mockResolvedValue({ cpuPercent: 1.5, rssBytes: 102400 * 1024 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('command structure', () => {
    it('returns a Commander Command instance', () => {
      const cmd = createStatusCommand();
      expect(cmd).toBeInstanceOf(Command);
    });

    it('has name "status"', () => {
      const cmd = createStatusCommand();
      expect(cmd.name()).toBe('status');
    });
  });

  describe('daemon not running', () => {
    it('does not call renderDetailView when read() returns null', async () => {
      mockDaemonService.read.mockResolvedValue(null);

      const cmd = createStatusCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockRenderDetailView).not.toHaveBeenCalled();
    });

    it('does not sample CPU and memory when no daemon running', async () => {
      mockDaemonService.read.mockResolvedValue(null);

      const cmd = createStatusCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockSampleStats.execute).not.toHaveBeenCalled();
    });

    it('does not call renderDetailView when PID is not alive', async () => {
      mockDaemonService.read.mockResolvedValue({
        pid: 99999,
        port: 4050,
        startedAt: new Date().toISOString(),
      });
      mockDaemonService.isAlive.mockReturnValue(false);

      const cmd = createStatusCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockRenderDetailView).not.toHaveBeenCalled();
    });
  });

  describe('daemon running — process metrics', () => {
    const startedAt = '2026-02-25T00:00:00.000Z';

    beforeEach(() => {
      mockDaemonService.read.mockResolvedValue({ pid: 12345, port: 4050, startedAt });
      mockDaemonService.isAlive.mockReturnValue(true);
    });

    it("samples the daemon's PID through the stats use case", async () => {
      const cmd = createStatusCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;

      expect(mockSampleStats.execute).toHaveBeenCalledWith(12345);
    });

    it('shows CPU% with one decimal', async () => {
      mockSampleStats.execute.mockResolvedValue({ cpuPercent: 2.3, rssBytes: 51200 * 1024 });

      const cmd = createStatusCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;

      const callArgs = mockRenderDetailView.mock.calls[0][0];
      const fields: { label: string; value: string }[] = callArgs.sections.flatMap(
        (s: { fields: { label: string; value: string }[] }) => s.fields
      );
      const cpuField = fields.find((f) => f.label.toLowerCase().includes('cpu'));
      expect(cpuField?.value).toBe('2.3%');
    });

    it('converts RSS from KB to MB (102400 KB = 100 MB)', async () => {
      const cmd = createStatusCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;

      const callArgs = mockRenderDetailView.mock.calls[0][0];
      const fields: { label: string; value: string }[] = callArgs.sections.flatMap(
        (s: { fields: { label: string; value: string }[] }) => s.fields
      );
      const memField = fields.find(
        (f) => f.label.toLowerCase().includes('mem') || f.label.toLowerCase().includes('rss')
      );
      expect(memField?.value).toContain('100');
    });

    it('calls renderDetailView with pid, port, url, uptime, cpu, and rss fields', async () => {
      const cmd = createStatusCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;

      expect(mockRenderDetailView).toHaveBeenCalledTimes(1);
      const callArgs = mockRenderDetailView.mock.calls[0][0];
      const fields: { label: string; value: string }[] = callArgs.sections.flatMap(
        (s: { fields: { label: string; value: string }[] }) => s.fields
      );
      const labels = fields.map((f) => f.label.toLowerCase());

      expect(labels.some((l) => l.includes('pid'))).toBe(true);
      expect(labels.some((l) => l.includes('port'))).toBe(true);
      expect(labels.some((l) => l.includes('url'))).toBe(true);
      expect(labels.some((l) => l.includes('uptime') || l.includes('started'))).toBe(true);
      expect(labels.some((l) => l.includes('cpu'))).toBe(true);
      expect(labels.some((l) => l.includes('mem') || l.includes('rss'))).toBe(true);
    });
  });

  describe('environment section', () => {
    const startedAt = '2026-02-25T00:00:00.000Z';

    beforeEach(() => {
      mockDaemonService.read.mockResolvedValue({ pid: 12345, port: 4050, startedAt });
      mockDaemonService.isAlive.mockReturnValue(true);
    });

    it('includes environment fields: shep home, cli version, node version, paths', async () => {
      const cmd = createStatusCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;

      const callArgs = mockRenderDetailView.mock.calls[0][0];
      const fields: { label: string; value: string }[] = callArgs.sections.flatMap(
        (s: { fields: { label: string; value: string }[] }) => s.fields
      );
      const labels = fields.map((f) => f.label.toLowerCase());

      expect(labels.some((l) => l.includes('shep home'))).toBe(true);
      expect(labels.some((l) => l.includes('cli version'))).toBe(true);
      expect(labels.some((l) => l.includes('node version'))).toBe(true);
      expect(labels.some((l) => l.includes('log file'))).toBe(true);
      expect(labels.some((l) => l.includes('db path'))).toBe(true);
    });

    it('displays the CLI version from VersionService', async () => {
      const cmd = createStatusCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;

      const callArgs = mockRenderDetailView.mock.calls[0][0];
      const fields: { label: string; value: string }[] = callArgs.sections.flatMap(
        (s: { fields: { label: string; value: string }[] }) => s.fields
      );
      const versionField = fields.find((f) => f.label.toLowerCase().includes('cli version'));
      expect(versionField?.value).toBe('1.56.0');
    });
  });

  describe('metrics fallback', () => {
    beforeEach(() => {
      mockDaemonService.read.mockResolvedValue({
        pid: 12345,
        port: 4050,
        startedAt: new Date().toISOString(),
      });
      mockDaemonService.isAlive.mockReturnValue(true);
    });

    it('shows metrics unavailable when the OS gives no numbers (Windows, ps timeout)', async () => {
      mockSampleStats.execute.mockResolvedValue(undefined);

      const cmd = createStatusCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;

      expect(mockRenderDetailView).toHaveBeenCalledTimes(1);
      const callArgs = mockRenderDetailView.mock.calls[0][0];
      const fields: { label: string; value: string }[] = callArgs.sections.flatMap(
        (s: { fields: { label: string; value: string }[] }) => s.fields
      );
      const cpuField = fields.find((f) => f.label.toLowerCase().includes('cpu'));
      expect(cpuField?.value).toBe('unavailable');
      const memField = fields.find((f) => f.label.toLowerCase().includes('mem'));
      expect(memField?.value).toBe('unavailable');
    });
  });

  describe('build identity and readiness', () => {
    const startedAt = '2026-02-25T00:00:00.000Z';

    beforeEach(() => {
      mockDaemonService.read.mockResolvedValue({ pid: 12345, port: 4050, startedAt });
      mockDaemonService.isAlive.mockReturnValue(true);
    });

    async function renderedFields(): Promise<{ label: string; value: string }[]> {
      const cmd = createStatusCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;
      const callArgs = mockRenderDetailView.mock.calls[0][0];
      return callArgs.sections.flatMap(
        (s: { fields: { label: string; value: string }[] }) => s.fields
      );
    }

    it('shows the OS platform, release and arch', async () => {
      const fields = await renderedFields();
      const osField = fields.find((f) => f.label.toLowerCase() === 'os');
      expect(osField?.value).toContain('linux');
      expect(osField?.value).toContain('6.8.0-generic');
      expect(osField?.value).toContain('x64');
    });

    it('shows the git SHA', async () => {
      const fields = await renderedFields();
      const shaField = fields.find((f) => f.label.toLowerCase().includes('git'));
      expect(shaField?.value).toBe('3f9a1c2');
    });

    it('calls the readiness endpoint instead of only reporting daemon.json + ps', async () => {
      const fields = await renderedFields();
      expect(mockCheckDaemonHealth.execute).toHaveBeenCalledOnce();
      const healthField = fields.find((f) => f.label.toLowerCase().includes('readiness'));
      expect(healthField?.value).toContain('Ready');
    });

    it('surfaces an unhealthy readiness answer rather than claiming the daemon is fine', async () => {
      mockCheckDaemonHealth.execute.mockResolvedValueOnce({
        daemonRunning: true,
        reachable: true,
        healthy: false,
        url: 'http://localhost:4050/api/health',
        httpStatus: 503,
        checks: [{ name: 'features', ok: false, detail: 'database is locked' }],
        error: null,
        failingChecks: [{ name: 'features', ok: false, detail: 'database is locked' }],
        summary: 'Unhealthy (HTTP 503) — features: database is locked',
      });
      const fields = await renderedFields();
      const healthField = fields.find((f) => f.label.toLowerCase().includes('readiness'));
      expect(healthField?.value).toContain('Unhealthy');
      expect(healthField?.value).toContain('database is locked');
    });

    it('still renders the rest of the status when the health probe throws', async () => {
      mockCheckDaemonHealth.execute.mockRejectedValueOnce(new Error('probe exploded'));
      const fields = await renderedFields();
      expect(fields.some((f) => f.label.toLowerCase().includes('pid'))).toBe(true);
      const healthField = fields.find((f) => f.label.toLowerCase().includes('readiness'));
      expect(healthField?.value).toContain('unavailable');
    });

    it('still renders the rest of the status when the build identity is unavailable', async () => {
      mockVersionService.getBuildIdentity.mockImplementationOnce(() => {
        throw new Error('package.json unreadable');
      });
      const fields = await renderedFields();
      expect(fields.some((f) => f.label.toLowerCase().includes('pid'))).toBe(true);
    });
  });
});
