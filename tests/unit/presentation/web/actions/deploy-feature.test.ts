// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();
const mockResolve = vi.fn();
vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => mockResolve(token),
}));

const { deployFeature } = await import(
  '../../../../../src/presentation/web/app/actions/deploy-feature.js'
);

describe('deployFeature server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve.mockImplementation((token: string) => {
      if (token === 'StartFeatureDeploymentUseCase') {
        return { execute: mockExecute };
      }
      return {};
    });
  });

  it('resolves StartFeatureDeploymentUseCase and returns {success, state}', async () => {
    mockExecute.mockResolvedValue({ state: 'Booting', url: null });

    const result = await deployFeature('feat-123');

    expect(mockResolve).toHaveBeenCalledWith('StartFeatureDeploymentUseCase');
    expect(mockExecute).toHaveBeenCalledWith('feat-123');
    expect(result).toEqual({ success: true, state: 'Booting' });
  });

  it('returns {success:false, error} when the use case throws', async () => {
    mockExecute.mockRejectedValue(new Error('Feature not found: nonexistent-id'));

    const result = await deployFeature('nonexistent-id');

    expect(result).toEqual({ success: false, error: 'Feature not found: nonexistent-id' });
  });

  it('returns a generic error for non-Error throws', async () => {
    mockExecute.mockRejectedValue('unexpected');

    const result = await deployFeature('feat-123');

    expect(result).toEqual({ success: false, error: 'Failed to deploy feature' });
  });
});
