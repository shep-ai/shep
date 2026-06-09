import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

let currentPathname = '/control-center';
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
  usePathname: () => currentPathname,
  useSearchParams: () => new URLSearchParams(),
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

const mockFitView = vi.fn();

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ fitView: mockFitView }),
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/app/actions/add-repository', () => ({
  addRepository: vi
    .fn()
    .mockResolvedValue({ repository: { id: 'test-id', path: '/test', name: 'test' } }),
}));

vi.mock('@/app/actions/delete-feature', () => ({
  deleteFeature: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/app/actions/delete-repository', () => ({
  deleteRepository: vi.fn().mockResolvedValue({ success: true }),
}));

const mockReparentFeature = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/app/actions/reparent-feature', () => ({
  reparentFeature: (...args: unknown[]) => mockReparentFeature(...args),
}));

import type { Edge } from '@xyflow/react';
import { ControlCenterInner } from '@/components/features/control-center/control-center-inner';
import { SidebarFeaturesProvider } from '@/hooks/sidebar-features-context';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DrawerCloseGuardProvider } from '@/hooks/drawer-close-guard';
import type { FeaturesCanvasProps } from '@/components/features/features-canvas';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { FeatureNodeData } from '@/components/common/feature-node';

// Capture FeaturesCanvas props so we can invoke callbacks (onNodeClick, onPaneClick)
// without requiring ReactFlow to render interactive nodes in jsdom.
let capturedCanvasProps: FeaturesCanvasProps;

vi.mock('@/components/features/features-canvas', () => ({
  FeaturesCanvas: (props: FeaturesCanvasProps) => {
    capturedCanvasProps = props;
    if (props.nodes.length === 0 && props.emptyState) {
      return <>{props.emptyState}</>;
    }
    return <div data-testid="mock-features-canvas" />;
  },
}));

// Mock the ControlCenterOnboarding since it's irrelevant for these tests
vi.mock('@/components/features/control-center/control-center-onboarding', () => ({
  ControlCenterOnboarding: () => <div data-testid="mock-empty-state" />,
}));

const featureNodeA: CanvasNodeType = {
  id: 'feature-a',
  type: 'featureNode',
  position: { x: 100, y: 100 },
  data: {
    name: 'Auth Module',
    description: 'OAuth2 authentication',
    featureId: '#fa01',
    lifecycle: 'implementation',
    state: 'running',
    progress: 45,
    agentType: 'claude-code',
    repositoryPath: '/home/user/my-repo',
    branch: 'feat/auth-module',
  } as FeatureNodeData,
};

const featureNodeB: CanvasNodeType = {
  id: 'feature-b',
  type: 'featureNode',
  position: { x: 100, y: 300 },
  data: {
    name: 'Payment Gateway',
    description: 'Stripe integration',
    featureId: '#fb02',
    lifecycle: 'research',
    state: 'action-required',
    progress: 80,
    repositoryPath: '/home/user/my-repo',
    branch: 'feat/payment-gateway',
  } as FeatureNodeData,
};

const repoNodeDefault: CanvasNodeType = {
  id: 'repo-default',
  type: 'repositoryNode',
  position: { x: 50, y: 50 },
  data: { name: 'my-repo', repositoryPath: '/home/user/my-repo', id: 'repo-default' },
} as CanvasNodeType;

const initialNodes: CanvasNodeType[] = [repoNodeDefault, featureNodeA, featureNodeB];

function renderControlCenter(nodes = initialNodes, edges: Edge[] = []) {
  return render(
    <SidebarProvider>
      <DrawerCloseGuardProvider>
        <SidebarFeaturesProvider>
          <ControlCenterInner initialNodes={nodes} initialEdges={edges} />
        </SidebarFeaturesProvider>
      </DrawerCloseGuardProvider>
    </SidebarProvider>
  );
}

describe('ControlCenterInner URL-based navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPathname = '/control-center';
    mockFitView.mockReset();
  });

  describe('node click navigates to feature route', () => {
    it('navigates to /feature/<id> when a feature node is clicked', () => {
      renderControlCenter();

      const cardEl = document.createElement('div');
      cardEl.dataset.testid = 'feature-node-card';
      act(() => {
        capturedCanvasProps.onNodeClick?.(
          { target: cardEl } as unknown as React.MouseEvent,
          featureNodeA
        );
      });

      expect(mockPush).toHaveBeenCalledWith('/feature/#fa01');
    });

    it('navigates to a different feature route when clicking another node', () => {
      renderControlCenter();

      const cardEl = document.createElement('div');
      cardEl.dataset.testid = 'feature-node-card';
      act(() => {
        capturedCanvasProps.onNodeClick?.(
          { target: cardEl } as unknown as React.MouseEvent,
          featureNodeB
        );
      });

      expect(mockPush).toHaveBeenCalledWith('/feature/#fb02');
    });
  });

  describe('pane click navigates to control-center', () => {
    it('navigates to /control-center when the canvas pane is clicked and a drawer route is active', () => {
      currentPathname = '/feature/#fa01';
      renderControlCenter();

      act(() => {
        capturedCanvasProps.onPaneClick?.({} as React.MouseEvent);
      });

      expect(mockPush).toHaveBeenCalledWith('/control-center');
    });

    it('does not navigate when pane is clicked and already at control-center', () => {
      currentPathname = '/control-center';
      renderControlCenter();

      act(() => {
        capturedCanvasProps.onPaneClick?.({} as React.MouseEvent);
      });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('empty state conditional rendering', () => {
    const repoNode: CanvasNodeType = {
      id: 'repo-1',
      type: 'repositoryNode',
      position: { x: 50, y: 50 },
      data: { name: 'my-repo', repositoryPath: '/home/user/my-repo', id: 'repo-1' },
    } as CanvasNodeType;

    it('renders empty state when no nodes exist', () => {
      renderControlCenter([]);

      expect(screen.getByTestId('mock-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-features-canvas')).not.toBeInTheDocument();
    });

    it('renders FeaturesCanvas when a repositoryNode exists', () => {
      renderControlCenter([repoNode]);

      expect(screen.getByTestId('mock-features-canvas')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-empty-state')).not.toBeInTheDocument();
    });
  });

  describe('non-feature nodes are ignored', () => {
    it('does not navigate when clicking a non-feature node', () => {
      const repoNode: CanvasNodeType = {
        id: 'repo-1',
        type: 'repositoryNode',
        position: { x: 50, y: 50 },
        data: { name: 'my-repo', repositoryPath: '/home/user/my-repo', id: 'repo-1' },
      } as CanvasNodeType;

      renderControlCenter([repoNode]);

      act(() => {
        capturedCanvasProps.onNodeClick?.({} as React.MouseEvent, repoNode);
      });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('feature-created event with fast-mode features', () => {
    it('adds optimistic node when shep:feature-created is dispatched', () => {
      renderControlCenter();

      act(() => {
        window.dispatchEvent(
          new CustomEvent('shep:feature-created', {
            detail: {
              featureId: 'fast-feature-1',
              name: 'Fast Feature',
              description: 'Quick fix',
              repositoryPath: '/home/user/my-repo',
            },
          })
        );
      });

      // The node should have been added via createFeatureNode
      const featureNodes = capturedCanvasProps.nodes.filter((n) => n.type === 'featureNode');
      const fastNode = featureNodes.find(
        (n) => (n.data as FeatureNodeData).featureId === 'fast-feature-1'
      );
      expect(fastNode).toBeDefined();
    });

    it('does not navigate on click for creating state nodes (fast or regular)', () => {
      renderControlCenter();

      // Add a feature node with creating state
      act(() => {
        window.dispatchEvent(
          new CustomEvent('shep:feature-created', {
            detail: {
              featureId: 'fast-feat-2',
              name: 'Fast Feature 2',
              repositoryPath: '/home/user/my-repo',
              parentId: undefined,
            },
          })
        );
      });

      // Simulate clicking on a creating node
      const creatingNode = capturedCanvasProps.nodes.find(
        (n) => n.type === 'featureNode' && (n.data as FeatureNodeData).state === 'creating'
      );

      if (creatingNode) {
        act(() => {
          capturedCanvasProps.onNodeClick?.({} as React.MouseEvent, creatingNode);
        });
        // Should NOT navigate for creating nodes
        expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/feature/'));
      }
    });
  });

  describe('selectedFeatureId is passed to canvas', () => {
    it('passes feature ID from URL to FeaturesCanvas', () => {
      currentPathname = '/feature/#fa01';
      renderControlCenter();

      expect(capturedCanvasProps.selectedFeatureId).toBe('#fa01');
    });

    it('passes null when no feature route is active', () => {
      currentPathname = '/control-center';
      renderControlCenter();

      expect(capturedCanvasProps.selectedFeatureId).toBeNull();
    });
  });

  describe('first-repo auto-focus', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls fitView when first repo is added to empty canvas', async () => {
      // Start with empty canvas — renders empty state
      renderControlCenter([]);

      // Dispatch the add-repository event
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('shep:add-repository', {
            detail: { path: '/home/user/first-repo' },
          })
        );
      });

      // Flush setTimeout(0) that waits for next render
      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(mockFitView).toHaveBeenCalledWith({
        maxZoom: 1.0,
        padding: 0.5,
        duration: 500,
      });
    });

    it('calls fitView focused on new node when repo is added to non-empty canvas', async () => {
      renderControlCenter();

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('shep:add-repository', {
            detail: { path: '/home/user/another-repo' },
          })
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(mockFitView).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
        })
      );
    });

    it('opens drawer at /create?repo=<path> after 600ms delay following fitView', async () => {
      renderControlCenter([]);

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('shep:add-repository', {
            detail: { path: '/home/user/first-repo' },
          })
        );
      });

      // Flush setTimeout(0) for fitView
      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      // Drawer should NOT have opened yet (only 1ms has passed, need 600ms)
      expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/create?repo='));

      // Advance past the 600ms delay
      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      expect(mockPush).toHaveBeenCalledWith(
        `/create?repo=${encodeURIComponent('/home/user/first-repo')}`
      );
    });

    it('does NOT open drawer when wasEmpty is false', async () => {
      renderControlCenter();

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('shep:add-repository', {
            detail: { path: '/home/user/another-repo' },
          })
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/create?repo='));
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Canvas reparenting via drag-to-connect & edge deletion             */
/* ------------------------------------------------------------------ */

const featParent: CanvasNodeType = {
  id: 'feat-parent-1',
  type: 'featureNode',
  position: { x: 100, y: 100 },
  data: {
    name: 'Parent Feature',
    description: 'Parent',
    featureId: 'parent-1',
    lifecycle: 'implementation',
    state: 'running',
    progress: 40,
    repositoryPath: '/home/user/my-repo',
    branch: 'feat/parent',
  } as FeatureNodeData,
};

const featChild: CanvasNodeType = {
  id: 'feat-child-1',
  type: 'featureNode',
  position: { x: 300, y: 100 },
  data: {
    name: 'Child Feature',
    description: 'Child',
    featureId: 'child-1',
    lifecycle: 'requirements',
    state: 'pending',
    progress: 0,
    repositoryPath: '/home/user/my-repo',
    branch: 'feat/child',
  } as FeatureNodeData,
};

const featDone: CanvasNodeType = {
  id: 'feat-done-1',
  type: 'featureNode',
  position: { x: 300, y: 300 },
  data: {
    name: 'Done Feature',
    description: 'Complete',
    featureId: 'done-1',
    lifecycle: 'review',
    state: 'done',
    progress: 100,
    repositoryPath: '/home/user/my-repo',
    branch: 'feat/done',
  } as FeatureNodeData,
};

const featOtherRepo: CanvasNodeType = {
  id: 'feat-other-1',
  type: 'featureNode',
  position: { x: 500, y: 100 },
  data: {
    name: 'Other Repo Feature',
    description: 'Different repo',
    featureId: 'other-1',
    lifecycle: 'implementation',
    state: 'running',
    progress: 20,
    repositoryPath: '/home/user/other-repo',
    branch: 'feat/other',
  } as FeatureNodeData,
};

const reparentNodes: CanvasNodeType[] = [
  repoNodeDefault,
  featParent,
  featChild,
  featDone,
  featOtherRepo,
];

describe('Canvas reparenting interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReparentFeature.mockResolvedValue({ success: true });
  });

  describe('handleConnect (drag-to-connect reparenting)', () => {
    it('calls reparentFeature server action for valid same-repo feature connection', async () => {
      renderControlCenter(reparentNodes);

      await act(async () => {
        capturedCanvasProps.onConnect?.({
          source: 'feat-parent-1',
          target: 'feat-child-1',
          sourceHandle: null,
          targetHandle: null,
        });
      });

      // Server action should be called with stripped feature IDs
      expect(mockReparentFeature).toHaveBeenCalledWith('child-1', 'parent-1');
    });

    it('rejects connections where source is not a feature node', () => {
      renderControlCenter(reparentNodes);

      act(() => {
        capturedCanvasProps.onConnect?.({
          source: 'repo-default',
          target: 'feat-child-1',
          sourceHandle: null,
          targetHandle: null,
        });
      });

      expect(mockReparentFeature).not.toHaveBeenCalled();
    });

    it('rejects connections where target is not a feature node', () => {
      renderControlCenter(reparentNodes);

      act(() => {
        capturedCanvasProps.onConnect?.({
          source: 'feat-parent-1',
          target: 'repo-default',
          sourceHandle: null,
          targetHandle: null,
        });
      });

      expect(mockReparentFeature).not.toHaveBeenCalled();
    });

    it('rejects self-connections', () => {
      renderControlCenter(reparentNodes);

      act(() => {
        capturedCanvasProps.onConnect?.({
          source: 'feat-parent-1',
          target: 'feat-parent-1',
          sourceHandle: null,
          targetHandle: null,
        });
      });

      expect(mockReparentFeature).not.toHaveBeenCalled();
    });

    it('rejects cross-repository connections', () => {
      renderControlCenter(reparentNodes);

      act(() => {
        capturedCanvasProps.onConnect?.({
          source: 'feat-parent-1',
          target: 'feat-other-1',
          sourceHandle: null,
          targetHandle: null,
        });
      });

      expect(mockReparentFeature).not.toHaveBeenCalled();
    });

    it('rejects connections to terminal-state features', () => {
      renderControlCenter(reparentNodes);

      act(() => {
        capturedCanvasProps.onConnect?.({
          source: 'feat-parent-1',
          target: 'feat-done-1',
          sourceHandle: null,
          targetHandle: null,
        });
      });

      expect(mockReparentFeature).not.toHaveBeenCalled();
    });
  });

  describe('handleEdgesDelete (edge deletion unparenting)', () => {
    it('calls reparentFeature with null parent for dependency edge deletion', async () => {
      const depEdge: Edge = {
        id: 'dep-1',
        source: 'feat-parent-1',
        target: 'feat-child-1',
        type: 'dependencyEdge',
      };

      renderControlCenter(reparentNodes, [depEdge]);

      await act(async () => {
        capturedCanvasProps.onEdgesDelete?.([depEdge]);
      });

      expect(mockReparentFeature).toHaveBeenCalledWith('child-1', null);
    });

    it('ignores non-dependency edges (e.g. repo-to-feature)', async () => {
      const repoEdge: Edge = {
        id: 'repo-edge-1',
        source: 'repo-default',
        target: 'feat-child-1',
        type: 'repoToFeature',
      };

      renderControlCenter(reparentNodes, [repoEdge]);

      await act(async () => {
        capturedCanvasProps.onEdgesDelete?.([repoEdge]);
      });

      expect(mockReparentFeature).not.toHaveBeenCalled();
    });

    it('handles multiple dependency edge deletions at once', async () => {
      const depEdge1: Edge = {
        id: 'dep-1',
        source: 'feat-parent-1',
        target: 'feat-child-1',
        type: 'dependencyEdge',
      };
      const depEdge2: Edge = {
        id: 'dep-2',
        source: 'feat-parent-1',
        target: 'feat-done-1',
        type: 'dependencyEdge',
      };

      renderControlCenter(reparentNodes, [depEdge1, depEdge2]);

      await act(async () => {
        capturedCanvasProps.onEdgesDelete?.([depEdge1, depEdge2]);
      });

      expect(mockReparentFeature).toHaveBeenCalledTimes(2);
      expect(mockReparentFeature).toHaveBeenCalledWith('child-1', null);
      expect(mockReparentFeature).toHaveBeenCalledWith('done-1', null);
    });
  });
});
