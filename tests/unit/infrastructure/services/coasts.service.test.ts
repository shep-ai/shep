/**
 * CoastsService Unit Tests
 *
 * Tests for the Coasts containerized runtime isolation service.
 * Uses constructor-injected exec function mock and structured agent caller mock.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vi.mock factory requires runtime import()
  const actual = (await importOriginal()) as typeof import('node:fs');
  return { ...actual, existsSync: mockExistsSync, writeFileSync: mockWriteFileSync };
});

import { CoastsService } from '@/infrastructure/services/coasts.service.js';
import type { IStructuredAgentCaller } from '@/application/ports/output/agents/structured-agent-caller.interface.js';

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

describe('CoastsService', () => {
  let service: CoastsService;
  let mockExecFile: ReturnType<typeof vi.fn<ExecFileFn>>;
  let mockStructuredCaller: IStructuredAgentCaller;
  const workDir = '/repos/my-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile = vi.fn<ExecFileFn>();
    mockStructuredCaller = {
      call: vi.fn(),
    };
    service = new CoastsService(mockExecFile, mockStructuredCaller);
  });

  describe('checkPrerequisites', () => {
    it('returns allMet true when all checks pass', async () => {
      // coast --version succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: 'coast 0.1.0', stderr: '' });
      // docker info succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: 'Docker info output', stderr: '' });
      // coast ls succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.checkPrerequisites(workDir);

      expect(result.coastBinary).toBe(true);
      expect(result.docker).toBe(true);
      expect(result.coastdRunning).toBe(true);
      expect(result.allMet).toBe(true);
      expect(result.missingMessages).toHaveLength(0);
    });

    it('coastBinary is false when coast --version throws ENOENT', async () => {
      const enoent = new Error('spawn coast ENOENT') as NodeJS.ErrnoException;
      enoent.code = 'ENOENT';
      mockExecFile.mockRejectedValueOnce(enoent);
      // docker info succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
      // coast ls fails because no binary
      mockExecFile.mockRejectedValueOnce(enoent);

      const result = await service.checkPrerequisites(workDir);

      expect(result.coastBinary).toBe(false);
      expect(result.allMet).toBe(false);
      expect(result.missingMessages).toEqual(
        expect.arrayContaining([expect.stringContaining('coast')])
      );
    });

    it('docker is false when docker info exits non-zero', async () => {
      // coast --version succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: 'coast 0.1.0', stderr: '' });
      // docker info fails
      const dockerError = new Error('Cannot connect to Docker daemon');
      mockExecFile.mockRejectedValueOnce(dockerError);
      // coast ls succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.checkPrerequisites(workDir);

      expect(result.docker).toBe(false);
      expect(result.allMet).toBe(false);
      expect(result.missingMessages).toEqual(
        expect.arrayContaining([expect.stringContaining('Docker')])
      );
    });

    it('coastdRunning is false when coast ls fails', async () => {
      // coast --version succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: 'coast 0.1.0', stderr: '' });
      // docker info succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
      // coast ls fails (daemon not running)
      mockExecFile.mockRejectedValueOnce(new Error('connection refused'));

      const result = await service.checkPrerequisites(workDir);

      expect(result.coastdRunning).toBe(false);
      expect(result.allMet).toBe(false);
      expect(result.missingMessages).toEqual(
        expect.arrayContaining([expect.stringContaining('coastd')])
      );
    });

    it('missingMessages includes install instructions for each missing prerequisite', async () => {
      const enoent = new Error('spawn coast ENOENT') as NodeJS.ErrnoException;
      enoent.code = 'ENOENT';
      // coast binary not found
      mockExecFile.mockRejectedValueOnce(enoent);
      // docker not running
      mockExecFile.mockRejectedValueOnce(new Error('Docker daemon not running'));
      // coastd not running (also fails because no binary)
      mockExecFile.mockRejectedValueOnce(enoent);

      const result = await service.checkPrerequisites(workDir);

      expect(result.missingMessages).toHaveLength(3);
      expect(result.missingMessages[0]).toContain('coasts.dev');
      expect(result.missingMessages[1]).toContain('Docker');
      expect(result.missingMessages[2]).toContain('coastd');
    });

    it('Windows platform returns allMet false immediately', async () => {
      // Create a service that thinks it's on Windows
      const winService = new CoastsService(mockExecFile, mockStructuredCaller, true);

      const result = await winService.checkPrerequisites(workDir);

      expect(result.allMet).toBe(false);
      expect(result.coastBinary).toBe(false);
      expect(result.docker).toBe(false);
      expect(result.coastdRunning).toBe(false);
      expect(result.missingMessages).toEqual(
        expect.arrayContaining([expect.stringContaining('not supported on Windows')])
      );
      // No subprocess calls should have been made
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('all three checks run in parallel (not sequentially)', async () => {
      const callOrder: string[] = [];

      mockExecFile.mockImplementation(async (cmd: string, args: string[]) => {
        const label = cmd === 'docker' ? 'docker' : `coast-${args[0]}`;
        callOrder.push(`start-${label}`);
        // Simulate async work
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push(`end-${label}`);
        return { stdout: 'ok', stderr: '' };
      });

      await service.checkPrerequisites(workDir);

      // All three starts should happen before any ends (parallel execution)
      const startIndices = callOrder
        .map((entry, i) => (entry.startsWith('start-') ? i : -1))
        .filter((i) => i >= 0);
      const firstEnd = callOrder.findIndex((entry) => entry.startsWith('end-'));

      // All three starts should happen before the first end
      expect(startIndices.filter((i) => i < firstEnd)).toHaveLength(3);
    });
  });

  describe('build', () => {
    it('calls execFile with coast build args and workDir cwd', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'Build complete', stderr: '' });

      await service.build(workDir);

      expect(mockExecFile).toHaveBeenCalledWith('coast', ['build'], {
        cwd: workDir,
        timeout: 30000,
      });
    });

    it('uses 30-second timeout', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.build(workDir);

      expect(mockExecFile).toHaveBeenCalledWith(
        'coast',
        ['build'],
        expect.objectContaining({ timeout: 30000 })
      );
    });

    it('throws with stderr on non-zero exit', async () => {
      const error = new Error('coast build failed') as Error & { stderr: string };
      error.stderr = 'Error: invalid Coastfile';
      mockExecFile.mockRejectedValueOnce(error);

      await expect(service.build(workDir)).rejects.toThrow(/coast build failed/);
    });
  });

  describe('run', () => {
    it('parses port and url from stdout', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'Coast instance running on port 8080\nURL: http://localhost:8080\n',
        stderr: '',
      });

      const result = await service.run(workDir);

      expect(result.port).toBe(8080);
      expect(result.url).toBe('http://localhost:8080');
    });

    it('returns CoastInstance on success', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'port 3000\nhttp://localhost:3000',
        stderr: '',
      });

      const result = await service.run(workDir);

      expect(result).toHaveProperty('port');
      expect(result).toHaveProperty('url');
      expect(typeof result.port).toBe('number');
      expect(typeof result.url).toBe('string');
    });

    it('calls execFile with coast run args', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'port 3000\nhttp://localhost:3000',
        stderr: '',
      });

      await service.run(workDir);

      expect(mockExecFile).toHaveBeenCalledWith('coast', ['run'], {
        cwd: workDir,
        timeout: 10000,
      });
    });

    it('throws with stderr on failure', async () => {
      const error = new Error('coast run failed') as Error & { stderr: string };
      error.stderr = 'No Coastfile found';
      mockExecFile.mockRejectedValueOnce(error);

      await expect(service.run(workDir)).rejects.toThrow(/coast run failed/);
    });
  });

  describe('stop', () => {
    it('calls execFile with coast stop args', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.stop(workDir);

      expect(mockExecFile).toHaveBeenCalledWith('coast', ['stop'], {
        cwd: workDir,
        timeout: 10000,
      });
    });

    it('does not throw when no instance is running', async () => {
      // coast stop exits successfully even if nothing is running
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await expect(service.stop(workDir)).resolves.toBeUndefined();
    });
  });

  describe('checkout', () => {
    it('calls execFile with coast checkout args', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.checkout(workDir);

      expect(mockExecFile).toHaveBeenCalledWith('coast', ['checkout'], {
        cwd: workDir,
        timeout: 10000,
      });
    });
  });

  describe('lookup', () => {
    it('returns CoastInstance when instance exists', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'port 4000\nhttp://localhost:4000',
        stderr: '',
      });

      const result = await service.lookup(workDir);

      expect(result).not.toBeNull();
      expect(result!.port).toBe(4000);
      expect(result!.url).toBe('http://localhost:4000');
    });

    it('returns null when no instance found', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('not found'));

      const result = await service.lookup(workDir);

      expect(result).toBeNull();
    });

    it('calls execFile with coast lookup args', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'port 3000\nhttp://localhost:3000',
        stderr: '',
      });

      await service.lookup(workDir);

      expect(mockExecFile).toHaveBeenCalledWith('coast', ['lookup'], {
        cwd: workDir,
        timeout: 10000,
      });
    });
  });

  describe('isRunning', () => {
    it('returns true when lookup succeeds', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'port 3000\nhttp://localhost:3000',
        stderr: '',
      });

      const result = await service.isRunning(workDir);

      expect(result).toBe(true);
    });

    it('returns false when lookup fails', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('not found'));

      const result = await service.isRunning(workDir);

      expect(result).toBe(false);
    });
  });

  describe('hasCoastfile', () => {
    it('returns true when Coastfile exists', async () => {
      mockExistsSync.mockReturnValue(true);

      const result = await service.hasCoastfile(workDir);

      expect(result).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledWith(expect.stringContaining('Coastfile'));
    });

    it('returns false when Coastfile missing', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await service.hasCoastfile(workDir);

      expect(result).toBe(false);
    });
  });

  describe('getInstallationPrompt', () => {
    it('runs coast installation-prompt subprocess', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'This is the installation prompt text...',
        stderr: '',
      });

      const result = await service.getInstallationPrompt();

      expect(result).toBe('This is the installation prompt text...');
      expect(mockExecFile).toHaveBeenCalledWith(
        'coast',
        ['installation-prompt'],
        expect.objectContaining({ timeout: 10000 })
      );
    });

    it('returns cached value on second call', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'Cached prompt text',
        stderr: '',
      });

      const first = await service.getInstallationPrompt();
      const second = await service.getInstallationPrompt();

      expect(first).toBe('Cached prompt text');
      expect(second).toBe('Cached prompt text');
      // Should only be called once — second call uses cache
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateCoastfile', () => {
    it('calls getInstallationPrompt then structuredCaller', async () => {
      // Mock getInstallationPrompt subprocess
      mockExecFile.mockResolvedValueOnce({
        stdout: 'Generate a Coastfile for this project...',
        stderr: '',
      });

      // Mock structuredCaller.call to return TOML content
      vi.mocked(mockStructuredCaller.call).mockResolvedValueOnce({
        content: '[project]\nname = "my-project"\n',
        warnings: [],
      });

      await service.generateCoastfile(workDir);

      expect(mockStructuredCaller.call).toHaveBeenCalledWith(
        expect.stringContaining('Generate a Coastfile'),
        expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            content: expect.any(Object),
          }),
        }),
        expect.objectContaining({
          allowedTools: [],
          silent: true,
        })
      );
    });

    it('writes content to workDir/Coastfile', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'prompt text',
        stderr: '',
      });

      vi.mocked(mockStructuredCaller.call).mockResolvedValueOnce({
        content: '[project]\nname = "test"\n',
        warnings: [],
      });

      await service.generateCoastfile(workDir);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('Coastfile'),
        '[project]\nname = "test"\n',
        'utf-8'
      );
    });

    it('returns the Coastfile path', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'prompt text',
        stderr: '',
      });

      vi.mocked(mockStructuredCaller.call).mockResolvedValueOnce({
        content: '[project]\nname = "test"\n',
        warnings: [],
      });

      const result = await service.generateCoastfile(workDir);

      expect(result).toContain('Coastfile');
      expect(result).toContain(workDir);
    });

    it('agent schema includes content and warnings fields', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'prompt text',
        stderr: '',
      });

      vi.mocked(mockStructuredCaller.call).mockResolvedValueOnce({
        content: '[project]\nname = "test"\n',
        warnings: [],
      });

      await service.generateCoastfile(workDir);

      const schemaArg = vi.mocked(mockStructuredCaller.call).mock.calls[0][1] as {
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(schemaArg.properties).toHaveProperty('content');
      expect(schemaArg.properties).toHaveProperty('warnings');
      expect(schemaArg.required).toContain('content');
    });
  });
});
