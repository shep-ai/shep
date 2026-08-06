import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  FOCUS_REPOSITORY_EVENT,
  findRepositoryNodeId,
  requestRepositoryFocus,
} from '@/lib/canvas-focus';
import type { CanvasNodeType } from '@/components/features/features-canvas';

function repoNode(id: string, data: Record<string, unknown>): CanvasNodeType {
  return { id, type: 'repositoryNode', position: { x: 0, y: 0 }, data } as CanvasNodeType;
}

function featureNode(id: string, data: Record<string, unknown>): CanvasNodeType {
  return { id, type: 'featureNode', position: { x: 0, y: 0 }, data } as CanvasNodeType;
}

describe('findRepositoryNodeId', () => {
  const nodes: CanvasNodeType[] = [
    repoNode('repo-r1', { id: 'r1', name: 'proj', repositoryPath: '/code/proj' }),
    repoNode('virtual-repo-/code/other', { name: 'other', repositoryPath: '/code/other' }),
    featureNode('feat-f1', { featureId: 'f1', name: 'Billing', repositoryPath: '/code/proj' }),
  ];

  it('matches a repository node by its entity id', () => {
    expect(findRepositoryNodeId(nodes, { repositoryId: 'r1', repositoryPath: '/nope' })).toBe(
      'repo-r1'
    );
  });

  it('falls back to the repository path when no id is given', () => {
    expect(findRepositoryNodeId(nodes, { repositoryPath: '/code/other' })).toBe(
      'virtual-repo-/code/other'
    );
  });

  it('matches Windows-style paths against normalized node paths', () => {
    const windowsNodes = [
      repoNode('repo-r2', { id: 'r2', name: 'win', repositoryPath: 'C:/Users/dev/win' }),
    ];

    expect(findRepositoryNodeId(windowsNodes, { repositoryPath: 'C:\\Users\\dev\\win' })).toBe(
      'repo-r2'
    );
  });

  it('never matches a non-repository node that shares the path', () => {
    expect(findRepositoryNodeId([nodes[2]], { repositoryPath: '/code/proj' })).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(
      findRepositoryNodeId(nodes, { repositoryId: 'gone', repositoryPath: '/gone' })
    ).toBeNull();
  });
});

describe('requestRepositoryFocus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches the focus event carrying the repository identity', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    requestRepositoryFocus({ repositoryId: 'r1', repositoryPath: '/code/proj' });

    expect(dispatch).toHaveBeenCalledTimes(1);
    const event = dispatch.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe(FOCUS_REPOSITORY_EVENT);
    expect(event.detail).toEqual({ repositoryId: 'r1', repositoryPath: '/code/proj' });
  });
});
