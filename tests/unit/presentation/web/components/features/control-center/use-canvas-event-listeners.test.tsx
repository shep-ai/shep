import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useCanvasEventListeners } from '@/components/features/control-center/use-canvas-event-listeners';
import { requestRepositoryFocus } from '@/lib/canvas-focus';
import type { CanvasNodeType } from '@/components/features/features-canvas';

const nodes = [
  {
    id: 'repo-r1',
    type: 'repositoryNode',
    position: { x: 0, y: 0 },
    data: { id: 'r1', name: 'proj', repositoryPath: '/code/proj' },
  },
] as CanvasNodeType[];

function setup(overrides: Partial<Parameters<typeof useCanvasEventListeners>[0]> = {}) {
  const focusOnNode = vi.fn();
  const handlers = {
    addRepoAndFocus: vi.fn(),
    createFeatureNode: vi.fn(),
    nodes,
    focusOnNode,
    handleDeleteFeature: vi.fn(),
    handleArchiveFeature: vi.fn(),
    handleUnarchiveFeature: vi.fn(),
    ...overrides,
  };
  renderHook(() => useCanvasEventListeners(handlers));
  return handlers;
}

describe('useCanvasEventListeners — shep:focus-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('focuses the repository node matching the requested entity id', () => {
    const { focusOnNode } = setup();

    requestRepositoryFocus({ repositoryId: 'r1', repositoryPath: '/code/proj' });

    expect(focusOnNode).toHaveBeenCalledWith('repo-r1');
  });

  it('focuses by path when the repository has no entity id', () => {
    const { focusOnNode } = setup();

    requestRepositoryFocus({ repositoryPath: '/code/proj' });

    expect(focusOnNode).toHaveBeenCalledWith('repo-r1');
  });

  it('does nothing when the repository is not on the canvas', () => {
    const { focusOnNode } = setup();

    requestRepositoryFocus({ repositoryId: 'gone', repositoryPath: '/code/gone' });

    expect(focusOnNode).not.toHaveBeenCalled();
  });
});
