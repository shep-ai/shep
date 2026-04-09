import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { Edge } from '@xyflow/react';
import { useControlCenterState } from '@/components/features/control-center/use-control-center-state';
import type { ControlCenterState } from '@/components/features/control-center/use-control-center-state';
import type { FeatureNodeType, FeatureNodeData } from '@/components/common/feature-node';
import type { RepositoryNodeType } from '@/components/common/repository-node';
import type { CanvasNodeType } from '@/components/features/features-canvas';

// --- Mocks ---

const mockRefresh = vi.fn();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

vi.mock('@/hooks/agent-events-provider', () => ({
  useAgentEventsContext: () => ({
    events: [],
    lastEvent: null,
    connectionStatus: 'connected' as const,
  }),
}));

const stubUnsubscribe = () => {
  /* stub */
};
const STABLE_EMPTY_ENTRY = {
  status: null,
  url: null,
  targetType: null,
  hydrated: false,
  deployLoading: false,
  stopLoading: false,
  deployError: null,
};
const deploymentStatusStub = {
  store: {
    hydrate: vi.fn(),
    getEntry: vi.fn(() => STABLE_EMPTY_ENTRY),
    update: vi.fn(),
    setStatus: vi.fn(),
    subscribe: vi.fn(() => stubUnsubscribe),
    subscribeAll: vi.fn(() => stubUnsubscribe),
  },
  deploy: vi.fn(),
  stop: vi.fn(),
  ensureHydrated: vi.fn(),
};
vi.mock('@/hooks/deployment-status-provider', () => ({
  useDeploymentStatusContext: () => deploymentStatusStub,
  useDeploymentStatusContextOptional: () => deploymentStatusStub,
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  }),
}));

// --- Server action mocks ---
const mockDeleteFeature = vi.fn();
const mockAddRepository = vi.fn();
const mockDeleteRepository = vi.fn();

vi.mock('@/app/actions/delete-feature', () => ({
  deleteFeature: (...args: unknown[]) => mockDeleteFeature(...args),
}));

vi.mock('@/app/actions/add-repository', () => ({
  addRepository: (...args: unknown[]) => mockAddRepository(...args),
}));

vi.mock('@/app/actions/delete-repository', () => ({
  deleteRepository: (...args: unknown[]) => mockDeleteRepository(...args),
}));

const mockFeatureNode: FeatureNodeType = {
  id: 'feat-1',
  type: 'featureNode',
  position: { x: 100, y: 100 },
  data: {
    name: 'Auth Module',
    featureId: '#f1',
    lifecycle: 'implementation',
    state: 'running',
    progress: 45,
    repositoryPath: '/home/user/my-repo',
    branch: 'feat/auth-module',
  },
};

const mockRepoNode: RepositoryNodeType = {
  id: 'repo-1',
  type: 'repositoryNode',
  position: { x: 0, y: 0 },
  data: {
    name: 'shep-ai/shep',
    repositoryPath: '/home/user/my-repo',
  },
};

/**
 * Test harness that renders the hook and exposes state via DOM + callback.
 * No ReactFlowProvider needed — the hook uses plain useState.
 */
function HookTestHarness({
  initialNodes = [],
  initialEdges = [],
  onStateChange,
}: {
  initialNodes?: CanvasNodeType[];
  initialEdges?: Edge[];
  onStateChange?: (state: ControlCenterState) => void;
}) {
  const state = useControlCenterState(initialNodes, initialEdges);

  if (onStateChange) {
    onStateChange(state);
  }

  return (
    <>
      <div data-testid="node-count">{state.nodes.length}</div>
      <div data-testid="edge-count">{state.edges.length}</div>
      <button data-testid="add-repository" onClick={() => state.handleAddRepository('my-org/repo')}>
        Add Repository
      </button>
      <button data-testid="delete-feature" onClick={() => state.handleDeleteFeature('1')}>
        Delete Feature
      </button>
      <button
        data-testid="add-to-feature-creating"
        onClick={() =>
          state.createFeatureNode('repo-1', {
            state: 'creating',
            name: 'Optimistic Feature',
            repositoryPath: '/home/user/my-repo',
          })
        }
      >
        Add Creating Feature
      </button>
    </>
  );
}

function renderHook(
  initialNodes: CanvasNodeType[] = [],
  initialEdges: Edge[] = [],
  onStateChange?: (state: ControlCenterState) => void
) {
  return render(
    <HookTestHarness
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      onStateChange={onStateChange}
    />
  );
}

describe('useControlCenterState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // Default: addRepository resolves successfully so handleAddRepository .then() doesn't throw
    mockAddRepository.mockResolvedValue({ repository: { id: 'test-repo-id', path: '/test' } });
  });

  it('initializes with provided nodes and edges', () => {
    renderHook([mockFeatureNode, mockRepoNode] as CanvasNodeType[], [
      { id: 'e1', source: 'repo-1', target: 'feat-1' },
    ]);
    expect(screen.getByTestId('node-count')).toHaveTextContent('2');
    expect(screen.getByTestId('edge-count')).toHaveTextContent('1');
  });

  describe('createFeatureNode state override and return value', () => {
    it('returns the generated node ID via createFeatureNode', () => {
      let capturedState: ControlCenterState | null = null;
      renderHook([mockRepoNode, mockFeatureNode] as CanvasNodeType[], [], (state) => {
        capturedState = state;
      });

      const nodeCountBefore = capturedState!.nodes.length;

      // Use createFeatureNode directly (via add-to-feature-creating button which calls createFeatureNode)
      act(() => {
        fireEvent.click(screen.getByTestId('add-to-feature-creating'));
      });

      // A new node should have been added
      expect(capturedState!.nodes.length).toBe(nodeCountBefore + 1);
      // The new node should have an ID matching the feature-{timestamp}-{counter} pattern
      const newNode = capturedState!.nodes.find(
        (n) => n.type === 'featureNode' && (n.data as FeatureNodeData).state === 'creating'
      );
      expect(newNode).toBeDefined();
      expect(newNode!.id).toMatch(/^feature-\d+-\d+$/);
    });

    it('creates a node with state "creating" when dataOverride has state creating', () => {
      let capturedState: ControlCenterState | null = null;
      renderHook([mockRepoNode] as CanvasNodeType[], [], (state) => {
        capturedState = state;
      });

      act(() => {
        fireEvent.click(screen.getByTestId('add-to-feature-creating'));
      });

      // The new node should have state 'creating'
      const newNode = capturedState!.nodes.find(
        (n) => n.type === 'featureNode' && (n.data as FeatureNodeData).state === 'creating'
      );
      expect(newNode).toBeDefined();
    });
  });

  describe('createFeatureNode positioning', () => {
    const parentFeature: FeatureNodeType = {
      id: 'feat-1',
      type: 'featureNode',
      position: { x: 100, y: 100 },
      data: {
        name: 'Parent Feature',
        featureId: '#p',
        lifecycle: 'implementation',
        state: 'running',
        progress: 50,
        repositoryPath: '/home/user/my-repo',
        branch: 'feat/feature-a',
      },
    };

    it('places new child feature to the right of the parent via createFeatureNode', () => {
      let capturedState: ControlCenterState | null = null;
      renderHook([parentFeature] as CanvasNodeType[], [], (state) => {
        capturedState = state;
      });

      // Use createFeatureNode directly
      act(() => {
        capturedState!.createFeatureNode('feat-1');
      });

      const childNode = capturedState!.nodes.find(
        (n) => n.type === 'featureNode' && n.id !== 'feat-1'
      );

      expect(childNode).toBeDefined();
      expect(childNode!.position.x).toBeGreaterThan(parentFeature.position.x);
    });

    it('places two children at distinct Y positions via dagre layout', () => {
      let capturedState: ControlCenterState | null = null;
      renderHook([parentFeature] as CanvasNodeType[], [], (state) => {
        capturedState = state;
      });

      // Add first child
      act(() => {
        capturedState!.createFeatureNode('feat-1');
      });
      const firstChildId = capturedState!.nodes.find(
        (n) => n.type === 'featureNode' && n.id !== 'feat-1'
      )!.id;

      // Add second child
      act(() => {
        capturedState!.createFeatureNode('feat-1');
      });

      const allChildren = capturedState!.nodes.filter(
        (n) => n.type === 'featureNode' && n.id !== 'feat-1'
      );
      expect(allChildren).toHaveLength(2);

      const firstChild = allChildren.find((n) => n.id === firstChildId)!;
      const secondChild = allChildren.find((n) => n.id !== firstChildId)!;

      // Dagre places siblings at different Y positions (not overlapping)
      expect(secondChild.position.y).not.toBe(firstChild.position.y);
    });
  });

  describe('handleAddRepository', () => {
    it('adds a new repository node', () => {
      renderHook([]);

      act(() => {
        fireEvent.click(screen.getByTestId('add-repository'));
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('1');
    });

    it('creates repo node with selected path as name', () => {
      let capturedState: ControlCenterState | null = null;
      renderHook([], [], (state) => {
        capturedState = state;
      });

      act(() => {
        fireEvent.click(screen.getByTestId('add-repository'));
      });

      const repoNode = capturedState!.nodes.find((n) => n.type === 'repositoryNode');
      expect(repoNode).toBeDefined();
      expect((repoNode!.data as { name: string }).name).toBe('repo');
    });

    it('places new repo via dagre layout', () => {
      let capturedState: ControlCenterState | null = null;
      renderHook([], [], (state) => {
        capturedState = state;
      });

      act(() => {
        fireEvent.click(screen.getByTestId('add-repository'));
      });

      const repoNode = capturedState!.nodes.find((n) => n.type === 'repositoryNode');
      expect(repoNode).toBeDefined();
      // Dagre assigns positions — just verify it exists and has valid coordinates
      expect(typeof repoNode!.position.x).toBe('number');
      expect(typeof repoNode!.position.y).toBe('number');
    });

    it('stacks multiple repos without overlap via dagre layout', () => {
      let capturedState: ControlCenterState | null = null;
      renderHook([], [], (state) => {
        capturedState = state;
      });

      // First add
      act(() => {
        fireEvent.click(screen.getByTestId('add-repository'));
      });

      // Second add
      act(() => {
        fireEvent.click(screen.getByTestId('add-repository'));
      });

      const repoNodes = capturedState!.nodes.filter((n) => n.type === 'repositoryNode');

      expect(repoNodes).toHaveLength(2);

      // Repos should not overlap (different Y positions via dagre layout)
      expect(repoNodes[0].position.y).not.toBe(repoNodes[1].position.y);
    });

    it('rolls back repo node on server action error', async () => {
      mockAddRepository.mockResolvedValue({ error: 'Repository already exists' });

      renderHook([]);

      await act(async () => {
        fireEvent.click(screen.getByTestId('add-repository'));
      });

      // Temp repo node should be removed (no nodes remain)
      expect(screen.getByTestId('node-count')).toHaveTextContent('0');
    });

    it('rolls back repo node on network failure', async () => {
      mockAddRepository.mockRejectedValue(new Error('Network error'));

      renderHook([]);

      await act(async () => {
        fireEvent.click(screen.getByTestId('add-repository'));
      });

      // Temp repo node should be removed (no nodes remain)
      expect(screen.getByTestId('node-count')).toHaveTextContent('0');
    });

    describe('first-repo metadata return value', () => {
      it('returns wasEmpty true when repoMap is empty', () => {
        let capturedState: ControlCenterState | null = null;
        renderHook([], [], (state) => {
          capturedState = state;
        });

        let result: { wasEmpty: boolean; repoPath: string } | undefined;
        act(() => {
          result = capturedState!.handleAddRepository('/home/user/first-repo');
        });

        expect(result).toBeDefined();
        expect(result!.wasEmpty).toBe(true);
      });

      it('returns wasEmpty false when repoMap has entries', () => {
        let capturedState: ControlCenterState | null = null;
        renderHook([mockRepoNode] as CanvasNodeType[], [], (state) => {
          capturedState = state;
        });

        let result: { wasEmpty: boolean; repoPath: string } | undefined;
        act(() => {
          result = capturedState!.handleAddRepository('/home/user/second-repo');
        });

        expect(result).toBeDefined();
        expect(result!.wasEmpty).toBe(false);
      });

      it('returns the correct repoPath', () => {
        let capturedState: ControlCenterState | null = null;
        renderHook([], [], (state) => {
          capturedState = state;
        });

        let result: { wasEmpty: boolean; repoPath: string } | undefined;
        act(() => {
          result = capturedState!.handleAddRepository('/home/user/my-project');
        });

        expect(result).toBeDefined();
        expect(result!.repoPath).toBe('/home/user/my-project');
      });

      it('returns wasEmpty false after a repo has already been added', () => {
        let capturedState: ControlCenterState | null = null;
        renderHook([], [], (state) => {
          capturedState = state;
        });

        // First add — should be empty
        let firstResult: { wasEmpty: boolean; repoPath: string } | undefined;
        act(() => {
          firstResult = capturedState!.handleAddRepository('/home/user/first-repo');
        });
        expect(firstResult!.wasEmpty).toBe(true);

        // Second add — should NOT be empty
        let secondResult: { wasEmpty: boolean; repoPath: string } | undefined;
        act(() => {
          secondResult = capturedState!.handleAddRepository('/home/user/second-repo');
        });
        expect(secondResult!.wasEmpty).toBe(false);
      });
    });
  });

  describe('optimistic approve/reject (shep:feature-approved)', () => {
    const actionRequiredFeature: FeatureNodeType = {
      id: 'feat-1',
      type: 'featureNode',
      position: { x: 100, y: 100 },
      data: {
        name: 'Auth Module',
        featureId: '1',
        lifecycle: 'review',
        state: 'action-required',
        progress: 80,
        repositoryPath: '/home/user/my-repo',
        branch: 'feat/auth-module',
      },
    };

    it('transitions feature node to running state on shep:feature-approved event', () => {
      let capturedState: ControlCenterState | null = null;
      renderHook([actionRequiredFeature, mockRepoNode] as CanvasNodeType[], [], (state) => {
        capturedState = state;
      });

      // Verify initial state is action-required
      const initialNode = capturedState!.nodes.find((n) => n.id === 'feat-1');
      expect((initialNode!.data as FeatureNodeData).state).toBe('action-required');

      // Dispatch the optimistic approval event
      act(() => {
        window.dispatchEvent(
          new CustomEvent('shep:feature-approved', {
            detail: { featureId: '1' },
          })
        );
      });

      // Node should now be in 'running' state
      const updatedNode = capturedState!.nodes.find((n) => n.id === 'feat-1');
      expect((updatedNode!.data as FeatureNodeData).state).toBe('running');
    });

    it('guards optimistic state from stale reconcile during transition', () => {
      let capturedState: ControlCenterState | null = null;
      const { rerender } = render(
        <HookTestHarness
          initialNodes={[actionRequiredFeature, mockRepoNode] as CanvasNodeType[]}
          initialEdges={[]}
          onStateChange={(state) => {
            capturedState = state;
          }}
        />
      );

      // Dispatch the optimistic approval event (engages mutation guard)
      act(() => {
        window.dispatchEvent(
          new CustomEvent('shep:feature-approved', {
            detail: { featureId: '1' },
          })
        );
      });

      expect(
        (capturedState!.nodes.find((n) => n.id === 'feat-1')!.data as FeatureNodeData).state
      ).toBe('running');

      // Simulate a stale server re-render with error state (this would cause the flash without the fix)
      const staleFeature: FeatureNodeType = {
        ...actionRequiredFeature,
        data: {
          ...actionRequiredFeature.data,
          state: 'error',
          errorMessage: 'Something went wrong',
        },
      };

      rerender(
        <HookTestHarness
          initialNodes={[staleFeature, mockRepoNode] as CanvasNodeType[]}
          initialEdges={[]}
          onStateChange={(state) => {
            capturedState = state;
          }}
        />
      );

      // The mutation guard should prevent the stale 'error' state from overwriting 'running'
      const nodeAfterReconcile = capturedState!.nodes.find((n) => n.id === 'feat-1');
      expect((nodeAfterReconcile!.data as FeatureNodeData).state).toBe('running');
    });
  });

  describe('fast-mode feature handling', () => {
    it('creates optimistic feature node with real featureId when provided', () => {
      let capturedState: ControlCenterState | null = null;
      renderHook([mockRepoNode] as CanvasNodeType[], [], (state) => {
        capturedState = state;
      });

      act(() => {
        capturedState!.createFeatureNode('repo-1', {
          state: 'creating',
          featureId: 'fast-feat-123',
          name: 'Fast Feature',
          repositoryPath: '/home/user/my-repo',
        });
      });

      // Node should exist with the provided featureId
      const newNode = capturedState!.nodes.find(
        (n) => n.type === 'featureNode' && (n.data as FeatureNodeData).featureId === 'fast-feat-123'
      );
      expect(newNode).toBeDefined();
      expect(newNode!.id).toBe('feat-fast-feat-123');
    });

    it('feature starting at Implementation lifecycle renders correctly after reconcile', () => {
      let capturedState: ControlCenterState | null = null;

      const { rerender } = render(
        <HookTestHarness
          initialNodes={[mockRepoNode] as CanvasNodeType[]}
          initialEdges={[]}
          onStateChange={(state) => {
            capturedState = state;
          }}
        />
      );

      // Simulate server returning a fast-mode feature with implementation lifecycle
      const fastFeature: FeatureNodeType = {
        id: 'feat-fast-1',
        type: 'featureNode',
        position: { x: 400, y: 100 },
        data: {
          name: 'Quick Fix',
          featureId: 'fast-1',
          lifecycle: 'implementation',
          state: 'running',
          progress: 0,
          repositoryPath: '/home/user/my-repo',
          branch: 'feat/quick-fix',
        },
      };

      rerender(
        <HookTestHarness
          initialNodes={[mockRepoNode, fastFeature] as CanvasNodeType[]}
          initialEdges={[]}
          onStateChange={(state) => {
            capturedState = state;
          }}
        />
      );

      const fastNode = capturedState!.nodes.find((n) => n.id === 'feat-fast-1');
      expect(fastNode).toBeDefined();
      expect((fastNode!.data as FeatureNodeData).lifecycle).toBe('implementation');
      expect((fastNode!.data as FeatureNodeData).state).toBe('running');
    });
  });

  describe('initialNodes/initialEdges prop sync', () => {
    it('syncs local state when initialNodes prop changes (different node IDs)', () => {
      const { rerender } = render(
        <HookTestHarness
          initialNodes={[mockRepoNode, mockFeatureNode] as CanvasNodeType[]}
          initialEdges={[]}
        />
      );

      // repo-1 + feat-1 = 2 nodes
      expect(screen.getByTestId('node-count')).toHaveTextContent('2');

      const newFeatureNode: FeatureNodeType = {
        id: 'feat-2',
        type: 'featureNode',
        position: { x: 200, y: 200 },
        data: {
          name: 'New Server Feature',
          featureId: '#f2',
          lifecycle: 'requirements',
          state: 'running',
          progress: 0,
          repositoryPath: '/home/user/my-repo',
          branch: 'feat/new',
        },
      };

      // Simulate router.refresh() delivering new initialNodes
      rerender(
        <HookTestHarness
          initialNodes={[mockRepoNode, mockFeatureNode, newFeatureNode] as CanvasNodeType[]}
          initialEdges={[]}
        />
      );

      // repo-1 + feat-1 + feat-2 = 3 nodes
      expect(screen.getByTestId('node-count')).toHaveTextContent('3');
    });

    it('syncs local edges when initialNodes add a feature with matching repositoryPath', () => {
      // Start with only repo node — no features, so 0 derived edges
      const { rerender } = render(
        <HookTestHarness initialNodes={[mockRepoNode] as CanvasNodeType[]} initialEdges={[]} />
      );

      expect(screen.getByTestId('edge-count')).toHaveTextContent('0');

      // Rerender with repo + feature → edge is derived from matching repositoryPath
      rerender(
        <HookTestHarness
          initialNodes={[mockRepoNode, mockFeatureNode] as CanvasNodeType[]}
          initialEdges={[]}
        />
      );

      expect(screen.getByTestId('edge-count')).toHaveTextContent('1');
    });

    it('replaces optimistic node when initialNodes changes to include real feature', () => {
      let capturedState: ControlCenterState | null = null;

      const { rerender } = render(
        <HookTestHarness
          initialNodes={[mockRepoNode] as CanvasNodeType[]}
          initialEdges={[]}
          onStateChange={(state) => {
            capturedState = state;
          }}
        />
      );

      // Add an optimistic node
      act(() => {
        capturedState!.createFeatureNode('repo-1', {
          state: 'creating',
          name: 'My Optimistic Feature',
          repositoryPath: '/home/user/my-repo',
        });
      });

      // There should now be 2 nodes (repo + optimistic)
      expect(screen.getByTestId('node-count')).toHaveTextContent('2');

      // Simulate server refresh with the real feature (no optimistic node)
      const realFeature: FeatureNodeType = {
        id: 'feat-real-123',
        type: 'featureNode',
        position: { x: 300, y: 100 },
        data: {
          name: 'My Optimistic Feature',
          featureId: '#r123',
          lifecycle: 'requirements',
          state: 'running',
          progress: 0,
          repositoryPath: '/home/user/my-repo',
          branch: 'feat/optimistic',
        },
      };
      const realEdge: Edge = {
        id: 'edge-repo-1-feat-real-123',
        source: 'repo-1',
        target: 'feat-real-123',
      };

      rerender(
        <HookTestHarness
          initialNodes={[mockRepoNode, realFeature] as CanvasNodeType[]}
          initialEdges={[realEdge]}
          onStateChange={(state) => {
            capturedState = state;
          }}
        />
      );

      // The optimistic node should be gone, replaced by the real feature
      expect(screen.getByTestId('node-count')).toHaveTextContent('2');
      const optimisticNode = capturedState!.nodes.find(
        (n) => n.type === 'featureNode' && (n.data as FeatureNodeData).state === 'creating'
      );
      expect(optimisticNode).toBeUndefined();

      const realNode = capturedState!.nodes.find((n) => n.id === 'feat-real-123');
      expect(realNode).toBeDefined();
    });

    it('does not update when initialNodes have the same IDs (stable comparison)', () => {
      const { rerender } = render(
        <HookTestHarness
          initialNodes={[mockRepoNode, mockFeatureNode] as CanvasNodeType[]}
          initialEdges={[]}
        />
      );

      // repo-1 + feat-1 = 2 nodes
      expect(screen.getByTestId('node-count')).toHaveTextContent('2');

      // Re-render with identical initialNodes (same IDs)
      rerender(
        <HookTestHarness
          initialNodes={[mockRepoNode, mockFeatureNode] as CanvasNodeType[]}
          initialEdges={[]}
        />
      );

      // Node count should remain 2 (no extra nodes added, no duplication)
      expect(screen.getByTestId('node-count')).toHaveTextContent('2');
    });
  });

  describe('handleDeleteFeature', () => {
    const featureNode: FeatureNodeType = {
      id: 'feat-1',
      type: 'featureNode',
      position: { x: 100, y: 100 },
      data: {
        name: 'Auth Module',
        featureId: '#f1',
        lifecycle: 'implementation',
        state: 'running',
        progress: 45,
        repositoryPath: '/home/user/my-repo',
        branch: 'feat/auth-module',
      },
    };

    const featureNode2: FeatureNodeType = {
      id: 'feat-2',
      type: 'featureNode',
      position: { x: 400, y: 100 },
      data: {
        name: 'Dashboard',
        featureId: '#f2',
        lifecycle: 'requirements',
        state: 'done',
        progress: 0,
        repositoryPath: '/home/user/my-repo',
        branch: 'feat/dashboard',
      },
    };

    const repoNode: RepositoryNodeType = {
      id: 'repo-1',
      type: 'repositoryNode',
      position: { x: 0, y: 0 },
      data: { name: 'shep-ai/shep', repositoryPath: '/home/user/my-repo' },
    };

    const edgeRepoToFeat1: Edge = {
      id: 'edge-repo-1-feat-1',
      source: 'repo-1',
      target: 'feat-1',
    };

    const edgeFeat1ToFeat2: Edge = {
      id: 'edge-feat-1-feat-2',
      source: 'feat-1',
      target: 'feat-2',
    };

    it('calls deleteFeature server action with correct featureId', async () => {
      mockDeleteFeature.mockResolvedValue({ feature: { id: 'f1' } });

      renderHook([featureNode, repoNode] as CanvasNodeType[], [edgeRepoToFeat1]);

      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-feature'));
      });

      expect(mockDeleteFeature).toHaveBeenCalledWith('1', undefined, undefined, undefined);
    });

    it('removes deleted node from canvas after successful delete', async () => {
      mockDeleteFeature.mockResolvedValue({ feature: { id: 'f1' } });

      renderHook([featureNode, featureNode2, repoNode] as CanvasNodeType[], [
        edgeRepoToFeat1,
        edgeFeat1ToFeat2,
      ]);

      expect(screen.getByTestId('node-count')).toHaveTextContent('3');

      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-feature'));
      });

      // feat-1 removed after server confirms deletion; feat-2 + repo remain
      expect(screen.getByTestId('node-count')).toHaveTextContent('2');
    });

    it('removes edges for deleted feature', async () => {
      mockDeleteFeature.mockResolvedValue({ feature: { id: 'f1' } });

      renderHook([featureNode, featureNode2, repoNode] as CanvasNodeType[], [
        edgeRepoToFeat1,
        edgeFeat1ToFeat2,
      ]);

      // Edges are derived from repositoryPath: repo→feat-1 and repo→feat-2 = 2
      expect(screen.getByTestId('edge-count')).toHaveTextContent('2');

      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-feature'));
      });

      // feat-1 removed; only repo→feat-2 edge remains
      expect(screen.getByTestId('edge-count')).toHaveTextContent('1');
    });

    it('navigates to root on successful deletion', async () => {
      mockDeleteFeature.mockResolvedValue({ feature: { id: 'f1' } });

      renderHook([featureNode] as CanvasNodeType[]);

      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-feature'));
      });

      expect(mockPush).toHaveBeenCalledWith('/');
    });

    it('shows error toast with server action error message', async () => {
      mockDeleteFeature.mockResolvedValue({ error: 'Feature has active processes' });

      renderHook([featureNode] as CanvasNodeType[]);

      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-feature'));
      });

      expect(mockToastError).toHaveBeenCalledWith('Feature has active processes');
    });

    it('preserves nodes and edges on server action error', async () => {
      mockDeleteFeature.mockResolvedValue({ error: 'Delete failed' });

      renderHook([featureNode, repoNode] as CanvasNodeType[], [edgeRepoToFeat1]);

      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-feature'));
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('2');
      expect(screen.getByTestId('edge-count')).toHaveTextContent('1');
    });

    it('shows generic error toast on network failure', async () => {
      mockDeleteFeature.mockRejectedValue(new Error('Network error'));

      renderHook([featureNode] as CanvasNodeType[]);

      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-feature'));
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to delete feature');
    });

    it('preserves state on network failure', async () => {
      mockDeleteFeature.mockRejectedValue(new Error('Network error'));

      renderHook([featureNode, repoNode] as CanvasNodeType[], [edgeRepoToFeat1]);

      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-feature'));
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('2');
      expect(screen.getByTestId('edge-count')).toHaveTextContent('1');
    });

    it('does not call router.refresh() on error', async () => {
      mockDeleteFeature.mockResolvedValue({ error: 'Delete failed' });

      renderHook([featureNode] as CanvasNodeType[]);

      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-feature'));
      });

      expect(mockRefresh).not.toHaveBeenCalled();
    });

    describe('post-deletion relayout', () => {
      // 3-node chain: repo -> feat-1 -> feat-2
      const chainRepoNode: RepositoryNodeType = {
        id: 'repo-1',
        type: 'repositoryNode',
        position: { x: 0, y: 100 },
        data: { name: 'shep-ai/shep', repositoryPath: '/home/user/my-repo' },
      };

      const chainFeat1: FeatureNodeType = {
        id: 'feat-1',
        type: 'featureNode',
        position: { x: 400, y: 100 },
        data: {
          name: 'Auth Module',
          featureId: '#f1',
          lifecycle: 'implementation',
          state: 'running',
          progress: 45,
          repositoryPath: '/home/user/my-repo',
          branch: 'feat/auth-module',
        },
      };

      const chainFeat2: FeatureNodeType = {
        id: 'feat-2',
        type: 'featureNode',
        position: { x: 800, y: 100 },
        data: {
          name: 'Dashboard',
          featureId: '#f2',
          lifecycle: 'requirements',
          state: 'done',
          progress: 0,
          repositoryPath: '/home/user/my-repo',
          branch: 'feat/dashboard',
        },
      };

      const chainEdgeRepoToFeat1: Edge = {
        id: 'edge-repo-1-feat-1',
        source: 'repo-1',
        target: 'feat-1',
      };

      const chainEdgeFeat1ToFeat2: Edge = {
        id: 'edge-feat-1-feat-2',
        source: 'feat-1',
        target: 'feat-2',
      };

      it('removes deleted feature from canvas after successful delete', async () => {
        mockDeleteFeature.mockResolvedValue({ feature: { id: 'f1' } });

        let capturedState: ControlCenterState | null = null;

        render(
          <HookTestHarness
            initialNodes={[chainRepoNode, chainFeat1, chainFeat2] as CanvasNodeType[]}
            initialEdges={[chainEdgeRepoToFeat1, chainEdgeFeat1ToFeat2]}
            onStateChange={(state) => {
              capturedState = state;
            }}
          />
        );

        await act(async () => {
          capturedState!.handleDeleteFeature('1');
        });

        // feat-1 removed after server confirms deletion; feat-2 + repo remain
        expect(capturedState!.nodes).toHaveLength(2);
        expect(capturedState!.nodes.find((n) => n.id === 'feat-1')).toBeUndefined();
      });

      it('restores all nodes and edges on server action error', async () => {
        mockDeleteFeature.mockResolvedValue({ error: 'Delete failed' });

        let capturedState: ControlCenterState | null = null;

        render(
          <HookTestHarness
            initialNodes={[chainRepoNode, chainFeat1, chainFeat2] as CanvasNodeType[]}
            initialEdges={[chainEdgeRepoToFeat1, chainEdgeFeat1ToFeat2]}
            onStateChange={(state) => {
              capturedState = state;
            }}
          />
        );

        await act(async () => {
          capturedState!.handleDeleteFeature('1');
        });

        // All 3 nodes should be restored after error rollback
        expect(capturedState!.nodes).toHaveLength(3);
        expect(capturedState!.nodes.map((n) => n.id).sort()).toEqual([
          'feat-1',
          'feat-2',
          'repo-1',
        ]);
        // Both derived edges should be restored (repo→feat-1, repo→feat-2)
        expect(capturedState!.edges).toHaveLength(2);
      });

      it('remaining nodes have valid positions after deletion', async () => {
        mockDeleteFeature.mockResolvedValue({ feature: { id: 'f1' } });

        let capturedState: ControlCenterState | null = null;

        render(
          <HookTestHarness
            initialNodes={[chainRepoNode, chainFeat1, chainFeat2] as CanvasNodeType[]}
            initialEdges={[chainEdgeRepoToFeat1, chainEdgeFeat1ToFeat2]}
            onStateChange={(state) => {
              capturedState = state;
            }}
          />
        );

        await act(async () => {
          capturedState!.handleDeleteFeature('1');
        });

        // Remaining nodes have valid positions
        for (const node of capturedState!.nodes) {
          expect(typeof node.position.x).toBe('number');
          expect(typeof node.position.y).toBe('number');
        }
      });

      it('removes deleted feature and its edges after successful delete', async () => {
        mockDeleteFeature.mockResolvedValue({ feature: { id: 'f1' } });

        let capturedState: ControlCenterState | null = null;

        render(
          <HookTestHarness
            initialNodes={[chainRepoNode, chainFeat1, chainFeat2] as CanvasNodeType[]}
            initialEdges={[chainEdgeRepoToFeat1, chainEdgeFeat1ToFeat2]}
            onStateChange={(state) => {
              capturedState = state;
            }}
          />
        );

        // Before deletion: 3 nodes, 2 derived edges (repo→feat-1, repo→feat-2)
        expect(capturedState!.nodes).toHaveLength(3);
        expect(capturedState!.edges).toHaveLength(2);

        await act(async () => {
          capturedState!.handleDeleteFeature('1');
        });

        // After deletion: feat-1 removed, feat-2 + repo remain
        expect(capturedState!.nodes).toHaveLength(2);
        expect(capturedState!.nodes.map((n) => n.id).sort()).toEqual(['feat-2', 'repo-1']);

        // Only repo→feat-2 edge remains
        expect(capturedState!.edges).toHaveLength(1);
      });
    });
  });
});
