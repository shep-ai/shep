// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();
const mockResolve = vi.fn();
vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => mockResolve(token),
}));

const { stopDeployment } = await import(
  '../../../../../src/presentation/web/app/actions/stop-deployment.js'
);

describe('stopDeployment server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(undefined);
    mockResolve.mockImplementation((token: string) => {
      if (token === 'StopDeploymentUseCase') {
        return { execute: mockExecute };
      }
      return {};
    });
  });

  it('resolves StopDeploymentUseCase and delegates execution', async () => {
    const result = await stopDeployment('feat-123');

    expect(mockResolve).toHaveBeenCalledWith('StopDeploymentUseCase');
    expect(mockExecute).toHaveBeenCalledWith('feat-123');
    expect(result).toEqual({ success: true });
  });

  it('returns {success:false} when the use case throws a validation error', async () => {
    mockExecute.mockRejectedValue(new Error('targetId is required'));

    const result = await stopDeployment('');

    expect(result).toEqual({ success: false, error: 'targetId is required' });
  });

  it('returns {success:false} when the use case throws a runtime error', async () => {
    mockExecute.mockRejectedValue(new Error('Process already exited'));

    const result = await stopDeployment('feat-123');

    expect(result).toEqual({ success: false, error: 'Process already exited' });
  });

  it('returns a generic error message for non-Error throws', async () => {
    mockExecute.mockRejectedValue('unexpected');

    const result = await stopDeployment('feat-123');

    expect(result).toEqual({ success: false, error: 'Failed to stop deployment' });
  });
});
