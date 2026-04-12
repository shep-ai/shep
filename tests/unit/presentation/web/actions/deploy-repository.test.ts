// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();
const mockResolve = vi.fn();
vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => mockResolve(token),
}));

const { deployRepository } = await import(
  '../../../../../src/presentation/web/app/actions/deploy-repository.js'
);

describe('deployRepository server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve.mockImplementation((token: string) => {
      if (token === 'StartRepositoryDeploymentUseCase') {
        return { execute: mockExecute };
      }
      return {};
    });
  });

  it('resolves StartRepositoryDeploymentUseCase and returns {success, state}', async () => {
    mockExecute.mockResolvedValue({ state: 'Booting', url: null });

    const result = await deployRepository('/repos/demo');

    expect(mockResolve).toHaveBeenCalledWith('StartRepositoryDeploymentUseCase');
    expect(mockExecute).toHaveBeenCalledWith('/repos/demo');
    expect(result).toEqual({ success: true, state: 'Booting' });
  });

  it('returns {success:false, error} when the use case throws a validation error', async () => {
    mockExecute.mockRejectedValue(new Error('repositoryPath must be an absolute path'));

    const result = await deployRepository('relative/path');

    expect(result).toEqual({ success: false, error: 'repositoryPath must be an absolute path' });
  });

  it('returns a generic error for non-Error throws', async () => {
    mockExecute.mockRejectedValue('boom');

    const result = await deployRepository('/repos/demo');

    expect(result).toEqual({ success: false, error: 'Failed to deploy repository' });
  });
});
