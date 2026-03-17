/**
 * Init-Remote Command Integration Tests
 *
 * Tests the CLI command registration, argument parsing, success output,
 * and error handling paths with mocked DI container and use case.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface.js';

const { mockResolve, mockExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/repositories/init-remote-repository.use-case.js', () => ({
  InitRemoteRepositoryUseCase: class {
    execute = mockExecute;
  },
}));

import { createInitRemoteCommand } from '../../../../../src/presentation/cli/commands/repo/init-remote.command.js';
import { createRepoCommand } from '../../../../../src/presentation/cli/commands/repo/index.js';

describe('shep repo init-remote command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
    mockResolve.mockReturnValue({ execute: mockExecute });
    mockExecute.mockResolvedValue({
      repoUrl: 'https://github.com/user/my-project',
      repoName: 'my-project',
      isPrivate: true,
    });
    process.exitCode = undefined;
  });

  it('should be registered as a subcommand of repo', () => {
    const repo = createRepoCommand();
    const subcommands = repo.commands.map((c) => c.name());
    expect(subcommands).toContain('init-remote');
  });

  it('should create a command named "init-remote"', () => {
    const cmd = createInitRemoteCommand();
    expect(cmd.name()).toBe('init-remote');
  });

  it('should have a description mentioning GitHub', () => {
    const cmd = createInitRemoteCommand();
    expect(cmd.description()).toMatch(/github/i);
  });

  it('should have an optional [name] argument', () => {
    const cmd = createInitRemoteCommand();
    const args = cmd.registeredArguments;
    expect(args.length).toBe(1);
    expect(args[0].name()).toBe('name');
    expect(args[0].required).toBe(false);
  });

  it('should call execute with cwd and default options when no args given', async () => {
    const cmd = createInitRemoteCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: expect.any(String),
        name: undefined,
        isPublic: false,
        org: undefined,
      })
    );
  });

  it('should pass [name] argument to use case', async () => {
    const cmd = createInitRemoteCommand();
    await cmd.parseAsync(['custom-repo'], { from: 'user' });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'custom-repo',
      })
    );
  });

  it('should pass --public flag as isPublic: true', async () => {
    const cmd = createInitRemoteCommand();
    await cmd.parseAsync(['--public'], { from: 'user' });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        isPublic: true,
      })
    );
  });

  it('should pass --org flag value to use case', async () => {
    const cmd = createInitRemoteCommand();
    await cmd.parseAsync(['--org', 'myorg'], { from: 'user' });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        org: 'myorg',
      })
    );
  });

  it('should pass [name], --public, and --org together', async () => {
    const cmd = createInitRemoteCommand();
    await cmd.parseAsync(['my-repo', '--public', '--org', 'myorg'], { from: 'user' });

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my-repo',
        isPublic: true,
        org: 'myorg',
      })
    );
  });

  it('should display success message with repo URL on success', async () => {
    const cmd = createInitRemoteCommand();
    await cmd.parseAsync([], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('https://github.com/user/my-project');
  });

  it('should display visibility as "private" for private repos', async () => {
    mockExecute.mockResolvedValue({
      repoUrl: 'https://github.com/user/my-project',
      repoName: 'my-project',
      isPrivate: true,
    });

    const cmd = createInitRemoteCommand();
    await cmd.parseAsync([], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('private');
  });

  it('should display visibility as "public" for public repos', async () => {
    mockExecute.mockResolvedValue({
      repoUrl: 'https://github.com/user/my-project',
      repoName: 'my-project',
      isPrivate: false,
    });

    const cmd = createInitRemoteCommand();
    await cmd.parseAsync([], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('public');
  });

  it('should set process.exitCode = 1 on REMOTE_ALREADY_EXISTS error', async () => {
    mockExecute.mockRejectedValue(
      new GitPrError('Remote exists', GitPrErrorCode.REMOTE_ALREADY_EXISTS)
    );

    const cmd = createInitRemoteCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toMatch(/remote.*already.*configured/i);
  });

  it('should set process.exitCode = 1 on GH_NOT_FOUND error', async () => {
    mockExecute.mockRejectedValue(new GitPrError('gh not found', GitPrErrorCode.GH_NOT_FOUND));

    const cmd = createInitRemoteCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toMatch(/gh cli.*not installed/i);
  });

  it('should set process.exitCode = 1 on AUTH_FAILURE error', async () => {
    mockExecute.mockRejectedValue(new GitPrError('auth failure', GitPrErrorCode.AUTH_FAILURE));

    const cmd = createInitRemoteCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toMatch(/gh auth login/i);
  });

  it('should set process.exitCode = 1 on REPO_CREATE_FAILED error and show gh message', async () => {
    mockExecute.mockRejectedValue(
      new GitPrError('repository name already exists', GitPrErrorCode.REPO_CREATE_FAILED)
    );

    const cmd = createInitRemoteCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(process.exitCode).toBe(1);
    const output = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('repository name already exists');
  });

  it('should set process.exitCode = 1 on generic error', async () => {
    mockExecute.mockRejectedValue(new Error('Unexpected failure'));

    const cmd = createInitRemoteCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
