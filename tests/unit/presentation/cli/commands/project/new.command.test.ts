/** `shep project new --repo` links the project to the application of a local folder. */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { create, adopt } = vi.hoisted(() => ({
  create: { execute: vi.fn() },
  adopt: { execute: vi.fn() },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: { name: string }) => {
      if (token.name === 'CreatePmProjectUseCase') return create;
      if (token.name === 'AdoptLocalRepositoryUseCase') return adopt;
      throw new Error(`unexpected token ${token.name}`);
    }),
  },
}));

import { createNewCommand } from '../../../../../../src/presentation/cli/commands/project/new.command.js';

const PROJECT = { name: 'Payments', identifierPrefix: 'PAY', slug: 'payments' };

describe('shep project new --repo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    process.exitCode = undefined;
    create.execute.mockResolvedValue({ ok: true, project: PROJECT });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('adopts the folder as an application and links the project to it', async () => {
    adopt.execute.mockResolvedValue({
      ok: true,
      adopted: true,
      application: { id: 'app-1', name: 'Pay Api', repositoryPath: '/work/pay-api' },
    });
    await createNewCommand().parseAsync(
      ['--name', 'Payments', '--prefix', 'PAY', '--repo', '/work/pay-api'],
      { from: 'user' }
    );
    expect(adopt.execute).toHaveBeenCalledWith(expect.stringMatching(/pay-api$/));
    expect(create.execute).toHaveBeenCalledWith({
      name: 'Payments',
      identifierPrefix: 'PAY',
      description: undefined,
      applicationId: 'app-1',
    });
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain('/work/pay-api');
  });

  it('stops when the folder cannot be adopted', async () => {
    adopt.execute.mockResolvedValue({ ok: false, error: 'Could not determine folder name' });
    await createNewCommand().parseAsync(['--name', 'Payments', '--prefix', 'PAY', '--repo', '/'], {
      from: 'user',
    });
    expect(create.execute).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
