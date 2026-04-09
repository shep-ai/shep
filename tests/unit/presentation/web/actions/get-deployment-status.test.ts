// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();
const mockResolve = vi.fn();
vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => mockResolve(token),
}));

const { getDeploymentStatus } = await import(
  '../../../../../src/presentation/web/app/actions/get-deployment-status.js'
);

describe('getDeploymentStatus server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve.mockImplementation((token: string) => {
      if (token === 'GetDeploymentStatusUseCase') {
        return { execute: mockExecute };
      }
      return {};
    });
  });

  it('resolves the GetDeploymentStatusUseCase and returns its result', async () => {
    mockExecute.mockResolvedValue({ state: 'Ready', url: 'http://localhost:3000' });

    const result = await getDeploymentStatus('feat-123');

    expect(mockResolve).toHaveBeenCalledWith('GetDeploymentStatusUseCase');
    expect(mockExecute).toHaveBeenCalledWith('feat-123');
    expect(result).toEqual({ state: 'Ready', url: 'http://localhost:3000' });
  });

  it('returns null when the use case returns null', async () => {
    mockExecute.mockResolvedValue(null);
    const result = await getDeploymentStatus('unknown');
    expect(result).toBeNull();
  });
});
