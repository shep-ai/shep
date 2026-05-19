/**
 * BedrockIntegrationService unit tests.
 *
 * Exercises both pathways of the adapter:
 *   - Short version probes (doctor + verify-style calls) routed through the
 *     injected ExecFunction.
 *   - Streaming lifecycle commands (init/sync/ship) routed through
 *     child_process.spawn (mocked here at the module boundary).
 *
 * Goal: lock the contract that the adapter never sets `shell: true`, always
 * sets `windowsHide: true`, passes args as an array, and surfaces the typed
 * domain errors PipxNotInstalledError / BedrockBinaryMissingError instead of
 * the raw Node ENOENT shape.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vi.mock factory requires runtime import()
  const actual = (await importOriginal()) as typeof import('node:child_process');
  return {
    ...actual,
    spawn: spawnMock,
  };
});

import { BedrockIntegrationService } from '@/infrastructure/services/integrations/bedrock-integration.service.js';
import { BedrockLifecycleAction } from '@/domain/generated/output.js';
import { PipxNotInstalledError } from '@/domain/errors/pipx-not-installed.error.js';
import { BedrockBinaryMissingError } from '@/domain/errors/bedrock-binary-missing.error.js';
import type { BedrockProgressChunk } from '@/application/ports/output/services/bedrock-integration.service.js';

type ExecFn = (
  file: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

interface EnoentError extends Error {
  code?: string;
}

function enoent(file: string): EnoentError {
  const e = new Error(`spawn ${file} ENOENT`) as EnoentError;
  e.code = 'ENOENT';
  return e;
}

/**
 * Build a fake `ChildProcess`-shaped EventEmitter so the adapter can wire up
 * its stdout/stderr handlers without actually spawning anything.
 */
function makeFakeChild(): {
  emitter: EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
  };
  emitStdout: (data: string) => void;
  emitStderr: (data: string) => void;
  finish: (code: number) => void;
  fail: (err: Error) => void;
} {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
  };
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => undefined;
  return {
    emitter: child,
    emitStdout: (data) => stdout.emit('data', Buffer.from(data)),
    emitStderr: (data) => stderr.emit('data', Buffer.from(data)),
    finish: (code) => child.emit('close', code),
    fail: (err) => child.emit('error', err),
  };
}

describe('BedrockIntegrationService', () => {
  let execFile: ReturnType<typeof vi.fn<ExecFn>>;
  let service: BedrockIntegrationService;

  beforeEach(() => {
    vi.resetAllMocks();
    execFile = vi.fn<ExecFn>();
    service = new BedrockIntegrationService(execFile);
  });

  describe('doctor()', () => {
    it('returns ok for every tier when all probes succeed', async () => {
      execFile.mockImplementation(async (file: string) => {
        if (file === 'python3') return { stdout: 'Python 3.11.5\n', stderr: '' };
        if (file === 'pipx') return { stdout: 'pipx 1.4.0\n', stderr: '' };
        if (file === 'bedrock') return { stdout: 'bedrock 0.3.0\n', stderr: '' };
        throw new Error(`unexpected probe ${file}`);
      });

      const health = await service.doctor();

      expect(health.python.status).toBe('ok');
      expect(health.pipx.status).toBe('ok');
      expect(health.bedrock.status).toBe('ok');
      expect(health.overall).toBe('ok');
      expect(health.python.detail).toContain('3.11');
    });

    it('reports python as missing when python3 is not on PATH', async () => {
      execFile.mockImplementation(async (file: string) => {
        if (file === 'python3') throw enoent('python3');
        return { stdout: 'ok', stderr: '' };
      });

      const health = await service.doctor();

      expect(health.python.status).toBe('missing');
      expect(health.python.remediation).toBeTruthy();
      expect(health.overall).not.toBe('ok');
    });

    it('reports python as error when version is below 3.9', async () => {
      execFile.mockImplementation(async (file: string) => {
        if (file === 'python3') return { stdout: 'Python 3.8.10\n', stderr: '' };
        return { stdout: 'ok', stderr: '' };
      });

      const health = await service.doctor();

      expect(health.python.status).toBe('error');
      expect(health.overall).not.toBe('ok');
    });

    it('reports pipx as missing and surfaces a PipxNotInstalled-style remediation', async () => {
      execFile.mockImplementation(async (file: string) => {
        if (file === 'python3') return { stdout: 'Python 3.11.0\n', stderr: '' };
        if (file === 'pipx') throw enoent('pipx');
        return { stdout: 'ok', stderr: '' };
      });

      const health = await service.doctor();

      expect(health.pipx.status).toBe('missing');
      expect(health.pipx.remediation).toBeTruthy();
    });

    it('reports bedrock binary as missing with a typed remediation when only bedrock is gone', async () => {
      execFile.mockImplementation(async (file: string) => {
        if (file === 'python3') return { stdout: 'Python 3.11.0\n', stderr: '' };
        if (file === 'pipx') return { stdout: 'pipx 1.4.0\n', stderr: '' };
        if (file === 'bedrock') throw enoent('bedrock');
        return { stdout: 'ok', stderr: '' };
      });

      const health = await service.doctor();

      expect(health.bedrock.status).toBe('missing');
      expect(health.bedrock.remediation).toBeTruthy();
    });
  });

  describe('streaming lifecycle (init/sync/ship)', () => {
    it('spawns with windowsHide=true, args-as-array, and no shell:true for init', async () => {
      const fake = makeFakeChild();
      spawnMock.mockReturnValue(fake.emitter);

      const initPromise = service.init({ cwd: '/repo' });
      fake.finish(0);
      await initPromise;

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [file, args, options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        Record<string, unknown>,
      ];
      expect(file).toBe('bedrock');
      expect(Array.isArray(args)).toBe(true);
      expect(args[0]).toBe(BedrockLifecycleAction.Init);
      expect(options.shell).not.toBe(true);
      expect(options.windowsHide).toBe(true);
      expect(options.cwd).toBe('/repo');
    });

    it('forwards stdout/stderr chunks through the onProgress callback', async () => {
      const fake = makeFakeChild();
      spawnMock.mockReturnValue(fake.emitter);
      const chunks: BedrockProgressChunk[] = [];

      const initPromise = service.init({
        cwd: '/repo',
        onProgress: (c: BedrockProgressChunk) => chunks.push(c),
      });
      fake.emitStdout('hello ');
      fake.emitStderr('warn');
      fake.emitStdout('world');
      fake.finish(0);

      const result = await initPromise;

      expect(chunks).toEqual([
        { stream: 'stdout', data: 'hello ' },
        { stream: 'stderr', data: 'warn' },
        { stream: 'stdout', data: 'world' },
      ]);
      expect(result.stdout).toBe('hello world');
      expect(result.stderr).toBe('warn');
      expect(result.exitCode).toBe(0);
      expect(result.action).toBe(BedrockLifecycleAction.Init);
    });

    it('throws BedrockBinaryMissingError when spawn fails with ENOENT', async () => {
      const fake = makeFakeChild();
      spawnMock.mockReturnValue(fake.emitter);
      const promise = service.sync({ cwd: '/repo' });
      fake.fail(enoent('bedrock'));

      await expect(promise).rejects.toBeInstanceOf(BedrockBinaryMissingError);
    });

    it('routes ship() through the same spawn pathway with the ship subcommand', async () => {
      const fake = makeFakeChild();
      spawnMock.mockReturnValue(fake.emitter);
      const shipPromise = service.ship({ cwd: '/repo' });
      fake.finish(0);
      await shipPromise;

      const args = spawnMock.mock.calls[0]?.[1] as string[];
      expect(args[0]).toBe(BedrockLifecycleAction.Ship);
    });
  });

  describe('typed errors during prereq verification', () => {
    it('exposes PipxNotInstalledError when callers want a hard signal on missing pipx', async () => {
      execFile.mockImplementation(async (file: string) => {
        if (file === 'pipx') throw enoent('pipx');
        return { stdout: '', stderr: '' };
      });

      await expect(service.verifyPipx()).rejects.toBeInstanceOf(PipxNotInstalledError);
    });

    it('exposes BedrockBinaryMissingError when the binary cannot be probed', async () => {
      execFile.mockImplementation(async (file: string) => {
        if (file === 'bedrock') throw enoent('bedrock');
        return { stdout: '', stderr: '' };
      });

      await expect(service.verifyBedrockBinary()).rejects.toBeInstanceOf(BedrockBinaryMissingError);
    });
  });
});
