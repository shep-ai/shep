import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { CreateTerminalSessionUseCase } from '../../../../../packages/core/src/application/use-cases/terminal/create-terminal-session.use-case.js';
import type { ITerminalSessionService } from '../../../../../packages/core/src/application/ports/output/services/terminal-session-service.interface.js';
import type { IGithubIntegrationRepository } from '../../../../../packages/core/src/application/ports/output/repositories/github-integration.repository.interface.js';

function makeService(): ITerminalSessionService {
  return {
    create: vi.fn(() => ({ id: 'sess-1', shell: '/bin/bash', cwd: '/tmp' })),
    write: vi.fn(),
    resize: vi.fn(),
    subscribe: vi.fn(() => () => {
      /* unsubscribe noop */
    }),
    exists: vi.fn(() => true),
    close: vi.fn(),
  };
}

function makeGithub(token: string | null = null): IGithubIntegrationRepository {
  return {
    get: vi.fn(async () => token),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    getStatus: vi.fn(async () => ({
      connected: token !== null,
      connectedAt: token !== null ? 1 : null,
      updatedAt: token !== null ? 1 : null,
    })),
  };
}

describe('CreateTerminalSessionUseCase', () => {
  it('delegates to the terminal service with the provided cwd and size', async () => {
    const service = makeService();
    const useCase = new CreateTerminalSessionUseCase(service, makeGithub());

    const result = await useCase.execute({ cwd: '/tmp', cols: 120, rows: 30 });

    expect(service.create).toHaveBeenCalledWith({
      cwd: '/tmp',
      cols: 120,
      rows: 30,
      extraEnv: {},
    });
    expect(result).toEqual({ id: 'sess-1', shell: '/bin/bash', cwd: '/tmp' });
  });

  it('rejects blank cwd values', async () => {
    const service = makeService();
    const useCase = new CreateTerminalSessionUseCase(service, makeGithub());

    await expect(useCase.execute({ cwd: '' })).rejects.toThrow(/cwd is required/);
    await expect(useCase.execute({ cwd: '   ' })).rejects.toThrow(/cwd is required/);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('forwards undefined size when omitted', async () => {
    const service = makeService();
    const useCase = new CreateTerminalSessionUseCase(service, makeGithub());

    await useCase.execute({ cwd: '/work' });

    expect(service.create).toHaveBeenCalledWith({
      cwd: '/work',
      cols: undefined,
      rows: undefined,
      extraEnv: {},
    });
  });

  it('injects GH_TOKEN/GITHUB_TOKEN when a github PAT is stored', async () => {
    const service = makeService();
    const useCase = new CreateTerminalSessionUseCase(service, makeGithub('ghp_secret'));

    await useCase.execute({ cwd: '/work' });

    expect(service.create).toHaveBeenCalledWith({
      cwd: '/work',
      cols: undefined,
      rows: undefined,
      extraEnv: { GH_TOKEN: 'ghp_secret', GITHUB_TOKEN: 'ghp_secret' },
    });
  });
});
