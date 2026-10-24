/**
 * batchApproveFeatures server action — unit tests.
 *
 * The action is a thin pass-through to `BatchApproveFeaturesUseCase`, the same
 * use case `shep fleet approve` runs. Its whole job is to resolve the use case
 * by token, forward the scope, and turn a thrown container/use-case error into
 * a value the drawer can toast instead of an unhandled rejection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBatchExecute = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token === 'BatchApproveFeaturesUseCase') return { execute: mockBatchExecute };
    throw new Error(`Unknown token: ${token}`);
  },
}));

const { batchApproveFeatures } = await import(
  '../../../../../src/presentation/web/app/actions/batch-approve-features.js'
);

describe('batchApproveFeatures server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards the selected feature ids to the batch use case', async () => {
    mockBatchExecute.mockResolvedValue({
      totalAttempted: 2,
      approvedCount: 2,
      approvedFeatureIds: ['feat-1', 'feat-2'],
      failedCount: 0,
      failures: [],
    });

    const result = await batchApproveFeatures({ featureIds: ['feat-1', 'feat-2'] });

    expect(mockBatchExecute).toHaveBeenCalledWith({ featureIds: ['feat-1', 'feat-2'] });
    expect(result).toEqual({
      totalAttempted: 2,
      approvedCount: 2,
      approvedFeatureIds: ['feat-1', 'feat-2'],
      failedCount: 0,
      failures: [],
    });
  });

  it('approves every waiting gate when no ids are supplied', async () => {
    mockBatchExecute.mockResolvedValue({
      totalAttempted: 5,
      approvedCount: 5,
      approvedFeatureIds: ['a', 'b', 'c', 'd', 'e'],
      failedCount: 0,
      failures: [],
    });

    await batchApproveFeatures();

    expect(mockBatchExecute).toHaveBeenCalledWith({});
  });

  it('reports per-feature failures without failing the whole call', async () => {
    mockBatchExecute.mockResolvedValue({
      totalAttempted: 2,
      approvedCount: 1,
      approvedFeatureIds: ['feat-1'],
      failedCount: 1,
      failures: [{ featureId: 'feat-2', reason: 'worktree is dirty' }],
    });

    const result = await batchApproveFeatures({ featureIds: ['feat-1', 'feat-2'] });

    expect(result.approvedCount).toBe(1);
    expect(result.failures).toEqual([{ featureId: 'feat-2', reason: 'worktree is dirty' }]);
    expect(result.error).toBeUndefined();
  });

  it('turns a thrown error into an error result rather than rejecting', async () => {
    mockBatchExecute.mockRejectedValue(new Error('DI container not available'));

    const result = await batchApproveFeatures({ featureIds: ['feat-1'] });

    expect(result).toEqual({
      totalAttempted: 0,
      approvedCount: 0,
      approvedFeatureIds: [],
      failedCount: 0,
      failures: [],
      skippedCount: 0,
      skipped: [],
      error: 'DI container not available',
    });
  });
});
