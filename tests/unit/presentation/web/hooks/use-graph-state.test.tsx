import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { useGraphState } from '@/hooks/use-graph-state';
import type { UseGraphStateReturn } from '@/hooks/use-graph-state';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { FeatureNodeData } from '@/components/common/feature-node';
import type { RepositoryNodeType } from '@/components/common/repository-node';
import type { FeatureNodeType } from '@/components/common/feature-node';
import type { Edge } from '@xyflow/react';

// --- Test fixtures ---

const makeFeatureNode = (
  id: string,
  repositoryPath = '/repo',
  overrides: Partial<FeatureNodeData> = {}
): FeatureNodeType => ({
  id,
  type: 'featureNode',
  position: { x: 0, y: 0 },
  data: {
    name: 'Test Feature',
    featureId: id,
    lifecycle: 'requirements',
    state: 'running',
    progress: 0,
    repositoryPath,
    branch: 'feat/test',
    ...overrides,
  },
});

const makeRepoNode = (id: string, repositoryPath = '/repo'): RepositoryNodeType => ({
  id,
  type: 'repositoryNode',
  position: { x: 0, y: 0 },
  data: { name: 'my-repo', repositoryPath, id: id.replace('repo-', '') },
});

// --- Test harness ---

function HookHarness({
  initialNodes,
  initialEdges,
  onState,
}: {
  initialNodes: CanvasNodeType[];
  initialEdges: Edge[];
  onState?: (s: UseGraphStateReturn) => void;
}) {
  const state = useGraphState(initialNodes, initialEdges);
  if (onState) onState(state);
  return (
    <>
      <div data-testid="node-count">{state.nodes.length}</div>
      <div data-testid="edge-count">{state.edges.length}</div>
    </>
  );
}

function renderHook(
  initialNodes: CanvasNodeType[] = [],
  initialEdges: Edge[] = [],
  onState?: (s: UseGraphStateReturn) => void
) {
  return render(
    <HookHarness initialNodes={initialNodes} initialEdges={initialEdges} onState={onState} />
  );
}

describe('useGraphState', () => {
  describe('initialization', () => {
    it('initializes with features/repos and returns correct nodes/edges', () => {
      const repoNode = makeRepoNode('repo-1');
      const featureNode = makeFeatureNode('feat-abc', '/repo');
      const edge: Edge = { id: 'edge-repo-1-feat-abc', source: 'repo-1', target: 'feat-abc' };

      renderHook([repoNode, featureNode], [edge]);

      expect(screen.getByTestId('node-count')).toHaveTextContent('2');
      expect(screen.getByTestId('edge-count')).toHaveTextContent('1');
    });

    it('derives edges from repositoryPath matching (repo→feature)', () => {
      const repoNode = makeRepoNode('repo-1', '/my-repo');
      const featureNode = makeFeatureNode('feat-abc', '/my-repo');

      let capturedState: UseGraphStateReturn | null = null;
      renderHook([repoNode, featureNode], [], (s) => {
        capturedState = s;
      });

      const edge = capturedState!.edges.find(
        (e) => e.source === 'repo-1' && e.target === 'feat-abc'
      );
      expect(edge).toBeDefined();
    });

    it('derives dependency edge from dep- prefixed initialEdge', () => {
      const parentFeature = makeFeatureNode('feat-parent', '/repo');
      const childFeature = makeFeatureNode('feat-child', '/repo');
      const repoNode = makeRepoNode('repo-1', '/repo');
      const depEdge: Edge = {
        id: 'dep-feat-parent-feat-child',
        source: 'feat-parent',
        target: 'feat-child',
        type: 'dependencyEdge',
      };

      let capturedState: UseGraphStateReturn | null = null;
      renderHook([repoNode, parentFeature, childFeature], [depEdge], (s) => {
        capturedState = s;
      });

      // Child has dependency edge, no repo→child edge
      const dep = capturedState!.edges.find((e) => e.type === 'dependencyEdge');
      expect(dep).toBeDefined();
      expect(dep?.source).toBe('feat-parent');
      expect(dep?.target).toBe('feat-child');

      const repoToChild = capturedState!.edges.find(
        (e) => e.source === 'repo-1' && e.target === 'feat-child'
      );
      expect(repoToChild).toBeUndefined();
    });
  });

  describe('reconcile', () => {
    it('adds new server feature → new node appears', () => {
      const repoNode = makeRepoNode('repo-1');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode], [], (s) => {
        capturedState = s;
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('1');

      const newFeature = makeFeatureNode('feat-new', '/repo');
      act(() => {
        capturedState!.reconcile([repoNode, newFeature], []);
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('2');
    });

    it('removes server feature → node disappears', () => {
      const repoNode = makeRepoNode('repo-1');
      const featureNode = makeFeatureNode('feat-abc');

      let capturedState: UseGraphStateReturn | null = null;
      renderHook([repoNode, featureNode], [], (s) => {
        capturedState = s;
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('2');

      act(() => {
        capturedState!.reconcile([repoNode], []);
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('1');
    });

    it('replaces pending feature with real feature when reconcile arrives', () => {
      const repoNode = makeRepoNode('repo-1');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode], [], (s) => {
        capturedState = s;
      });

      // Add pending feature
      act(() => {
        capturedState!.addPendingFeature('feature-temp-123', {
          name: 'My Feature',
          featureId: 'feature-temp-123',
          lifecycle: 'requirements',
          state: 'creating',
          progress: 0,
          repositoryPath: '/repo',
          branch: '',
        });
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('2');

      const creatingNodes = capturedState!.nodes.filter(
        (n) => n.type === 'featureNode' && (n.data as FeatureNodeData).state === 'creating'
      );
      expect(creatingNodes).toHaveLength(1);

      // Server reconcile brings the real feature
      const realFeature = makeFeatureNode('feat-real-1', '/repo', {
        state: 'running',
        name: 'My Feature',
      });
      act(() => {
        capturedState!.reconcile([repoNode, realFeature], []);
      });

      // Pending node replaced, still 2 total
      expect(screen.getByTestId('node-count')).toHaveTextContent('2');

      const creatingNodesAfter = capturedState!.nodes.filter(
        (n) => n.type === 'featureNode' && (n.data as FeatureNodeData).state === 'creating'
      );
      expect(creatingNodesAfter).toHaveLength(0);

      const realNode = capturedState!.nodes.find((n) => n.id === 'feat-real-1');
      expect(realNode).toBeDefined();
    });

    it('edges are correct after pending→real replacement', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode], [], (s) => {
        capturedState = s;
      });

      act(() => {
        capturedState!.addPendingFeature('feature-temp-123', {
          name: 'My Feature',
          featureId: 'feature-temp-123',
          lifecycle: 'requirements',
          state: 'creating',
          progress: 0,
          repositoryPath: '/repo',
          branch: '',
        });
      });

      // After reconcile, edge should point to real feature, not temp
      const realFeature = makeFeatureNode('feat-real-1', '/repo', { name: 'My Feature' });
      const realEdge: Edge = {
        id: 'edge-repo-1-feat-real-1',
        source: 'repo-1',
        target: 'feat-real-1',
      };
      act(() => {
        capturedState!.reconcile([repoNode, realFeature], [realEdge]);
      });

      const tempEdge = capturedState!.edges.find((e) => e.target === 'feature-temp-123');
      expect(tempEdge).toBeUndefined();

      const realEdgeAfter = capturedState!.edges.find((e) => e.target === 'feat-real-1');
      expect(realEdgeAfter).toBeDefined();
    });

    it('preserves optimistic temp repo when server data does not include it yet', () => {
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([], [], (s) => {
        capturedState = s;
      });

      // Optimistically add a repo with a temp ID
      act(() => {
        capturedState!.addRepository('repo-temp-1', {
          name: 'my-repo',
          repositoryPath: '/path/to/my-repo',
          id: 'repo-temp-1',
        });
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('1');

      // Polling reconcile fires — server doesn't have this repo yet
      act(() => {
        capturedState!.reconcile([], []);
      });

      // Temp repo should still be visible (not wiped)
      expect(screen.getByTestId('node-count')).toHaveTextContent('1');
      const repoNode = capturedState!.nodes.find((n) => n.id === 'repo-temp-1');
      expect(repoNode).toBeDefined();
    });

    it('drops temp repo once server data includes the same repositoryPath', () => {
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([], [], (s) => {
        capturedState = s;
      });

      // Optimistically add a repo with a temp ID
      act(() => {
        capturedState!.addRepository('repo-temp-1', {
          name: 'my-repo',
          repositoryPath: '/path/to/my-repo',
          id: 'repo-temp-1',
        });
      });

      // Server now returns the real repo for the same path
      const serverRepo = makeRepoNode('repo-abc', '/path/to/my-repo');
      act(() => {
        capturedState!.reconcile([serverRepo], []);
      });

      // Only the real repo should remain, no duplicate
      expect(screen.getByTestId('node-count')).toHaveTextContent('1');
      const realNode = capturedState!.nodes.find((n) => n.id === 'repo-abc');
      expect(realNode).toBeDefined();
      const tempNode = capturedState!.nodes.find((n) => n.id === 'repo-temp-1');
      expect(tempNode).toBeUndefined();
    });

    it('does not preserve non-temp repos that the server no longer returns', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode], [], (s) => {
        capturedState = s;
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('1');

      // Server no longer returns this repo (deleted on server)
      act(() => {
        capturedState!.reconcile([], []);
      });

      // Non-temp repo should be removed
      expect(screen.getByTestId('node-count')).toHaveTextContent('0');
    });
  });

  describe('updateFeature', () => {
    it('changes state → derived node state changes', () => {
      const repoNode = makeRepoNode('repo-1');
      const featureNode = makeFeatureNode('feat-abc', '/repo', { state: 'running' });

      let capturedState: UseGraphStateReturn | null = null;
      renderHook([repoNode, featureNode], [], (s) => {
        capturedState = s;
      });

      act(() => {
        capturedState!.updateFeature('feat-abc', { state: 'action-required' });
      });

      const node = capturedState!.nodes.find((n) => n.id === 'feat-abc');
      expect((node?.data as FeatureNodeData).state).toBe('action-required');
    });

    it('changes lifecycle → derived node lifecycle changes', () => {
      const repoNode = makeRepoNode('repo-1');
      const featureNode = makeFeatureNode('feat-abc', '/repo', { lifecycle: 'requirements' });

      let capturedState: UseGraphStateReturn | null = null;
      renderHook([repoNode, featureNode], [], (s) => {
        capturedState = s;
      });

      act(() => {
        capturedState!.updateFeature('feat-abc', { lifecycle: 'implementation' });
      });

      const node = capturedState!.nodes.find((n) => n.id === 'feat-abc');
      expect((node?.data as FeatureNodeData).lifecycle).toBe('implementation');
    });

    it('unknown featureId is silently ignored (no crash)', () => {
      renderHook([makeRepoNode('repo-1')], []);
      let capturedState: UseGraphStateReturn | null = null;

      render(
        <HookHarness
          initialNodes={[makeRepoNode('repo-1')]}
          initialEdges={[]}
          onState={(s) => {
            capturedState = s;
          }}
        />
      );

      expect(() => {
        act(() => {
          capturedState!.updateFeature('feat-unknown', { state: 'done' });
        });
      }).not.toThrow();
    });
  });

  describe('addPendingFeature / removePendingFeature', () => {
    it('adds pending feature → creating node with edge to repo appears', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode], [], (s) => {
        capturedState = s;
      });

      act(() => {
        capturedState!.addPendingFeature('feature-temp-123', {
          name: 'New Feature',
          featureId: 'feature-temp-123',
          lifecycle: 'requirements',
          state: 'creating',
          progress: 0,
          repositoryPath: '/repo',
          branch: '',
        });
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('2');

      const pendingNode = capturedState!.nodes.find((n) => n.id === 'feature-temp-123');
      expect(pendingNode).toBeDefined();
      expect((pendingNode?.data as FeatureNodeData).state).toBe('creating');

      const edge = capturedState!.edges.find((e) => e.target === 'feature-temp-123');
      expect(edge).toBeDefined();
      expect(edge?.source).toBe('repo-1');
    });

    it('removePendingFeature → creating node disappears', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode], [], (s) => {
        capturedState = s;
      });

      act(() => {
        capturedState!.addPendingFeature('feature-temp-123', {
          name: 'New Feature',
          featureId: 'feature-temp-123',
          lifecycle: 'requirements',
          state: 'creating',
          progress: 0,
          repositoryPath: '/repo',
          branch: '',
        });
      });

      act(() => {
        capturedState!.removePendingFeature('feature-temp-123');
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('1');
    });
  });

  describe('full lifecycle: addPending → SSE → reconcile with AI rename', () => {
    it('BUG REPRO: SSE updates + reconcile with AI-changed name → exactly ONE node with correct state', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode], [], (s) => {
        capturedState = s;
      });

      // Step 1: User creates feature → pending node with "creating" state
      act(() => {
        capturedState!.addPendingFeature('feat-uuid-123', {
          name: 'sdg',
          featureId: 'uuid-123',
          lifecycle: 'requirements',
          state: 'creating',
          progress: 0,
          repositoryPath: '/repo',
          branch: '',
        });
      });

      // Verify pending node exists with "creating" state
      const creatingNode = capturedState!.nodes.find((n) => n.id === 'feat-uuid-123');
      expect(creatingNode).toBeDefined();
      expect((creatingNode?.data as FeatureNodeData).state).toBe('creating');

      // Step 2: SSE event arrives — feature transitions to "running"
      // (Feature is NOT in featureMap yet, only in pendingMap)
      act(() => {
        capturedState!.updateFeature('feat-uuid-123', { state: 'running' });
      });

      // Step 3: SSE event — feature transitions to "action-required" (waiting_approval)
      act(() => {
        capturedState!.updateFeature('feat-uuid-123', { state: 'action-required' });
      });

      // Step 4: Server reconcile arrives — AI has renamed "sdg" → "Fractal Dispatcher"
      // Server data has the feature with the AI-generated name
      const serverFeature = makeFeatureNode('feat-uuid-123', '/repo', {
        state: 'action-required',
        name: 'Fractal Dispatcher',
        featureId: 'uuid-123',
      });
      act(() => {
        capturedState!.reconcile(
          [repoNode, serverFeature],
          [{ id: 'edge-repo-1-feat-uuid-123', source: 'repo-1', target: 'feat-uuid-123' }]
        );
      });

      // CRITICAL ASSERTIONS:
      // 1. Exactly ONE node for this feature (no duplicates from pendingMap + featureMap)
      const featureNodes = capturedState!.nodes.filter((n) => n.id === 'feat-uuid-123');
      expect(featureNodes).toHaveLength(1);

      // 2. The node shows the correct state (action-required, NOT "running" or "creating")
      const data = featureNodes[0].data as FeatureNodeData;
      expect(data.state).toBe('action-required');

      // 3. The node shows the AI-generated name
      expect(data.name).toBe('Fractal Dispatcher');
    });

    it('BUG REPRO: SSE arrives BEFORE reconcile for unknown feature → buffered updates applied on reconcile', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode], [], (s) => {
        capturedState = s;
      });

      // SSE events arrive for a feature that's not in any map yet
      // (e.g., page loaded after feature was already created server-side)
      act(() => {
        capturedState!.updateFeature('feat-new-abc', {
          state: 'action-required',
          lifecycle: 'review',
        });
      });

      // Feature doesn't exist yet — no node
      const beforeNode = capturedState!.nodes.find((n) => n.id === 'feat-new-abc');
      expect(beforeNode).toBeUndefined();

      // Reconcile brings the feature from server
      const serverFeature = makeFeatureNode('feat-new-abc', '/repo', {
        state: 'running',
        lifecycle: 'requirements',
        name: 'Server Feature',
        featureId: 'new-abc',
      });
      act(() => {
        capturedState!.reconcile(
          [repoNode, serverFeature],
          [{ id: 'edge-repo-1-feat-new-abc', source: 'repo-1', target: 'feat-new-abc' }]
        );
      });

      // Buffered SSE updates should be applied ON TOP of server data
      const node = capturedState!.nodes.find((n) => n.id === 'feat-new-abc');
      expect(node).toBeDefined();
      const data = node?.data as FeatureNodeData;
      expect(data.state).toBe('action-required'); // from SSE buffer, not server's 'running'
      expect(data.lifecycle).toBe('review'); // from SSE buffer, not server's 'requirements'
    });

    it('BUG REPRO: reconcile with name change does NOT leave stale pendingMap ghost node', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode], [], (s) => {
        capturedState = s;
      });

      // Add pending feature with user-typed name
      act(() => {
        capturedState!.addPendingFeature('feat-uuid-456', {
          name: 'my quick feature',
          featureId: 'uuid-456',
          lifecycle: 'requirements',
          state: 'creating',
          progress: 0,
          repositoryPath: '/repo',
          branch: '',
        });
      });

      expect(capturedState!.nodes.filter((n) => n.type === 'featureNode')).toHaveLength(1);

      // Reconcile: server has the feature but AI renamed it
      const serverFeature = makeFeatureNode('feat-uuid-456', '/repo', {
        state: 'running',
        name: 'Quantum Flux Optimizer', // AI renamed from "my quick feature"
        featureId: 'uuid-456',
      });
      act(() => {
        capturedState!.reconcile(
          [repoNode, serverFeature],
          [{ id: 'edge-repo-1-feat-uuid-456', source: 'repo-1', target: 'feat-uuid-456' }]
        );
      });

      // Must be exactly ONE feature node, not two
      const featureNodes = capturedState!.nodes.filter((n) => n.type === 'featureNode');
      expect(featureNodes).toHaveLength(1);

      // And it must show the server/AI name, not the stale pending name
      const data = featureNodes[0].data as FeatureNodeData;
      expect(data.name).toBe('Quantum Flux Optimizer');
      expect(data.state).toBe('running');
    });
  });

  describe('mutation guard', () => {
    it('reconcile is a no-op while a mutation is in-flight', () => {
      const repoNode = makeRepoNode('repo-1');
      const featureNode = makeFeatureNode('feat-abc', '/repo');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode, featureNode], [], (s) => {
        capturedState = s;
      });

      expect(screen.getByTestId('node-count')).toHaveTextContent('2');

      // Begin mutation — reconcile should become a no-op
      act(() => {
        capturedState!.beginMutation();
      });

      // Stale poll tries to remove the feature — should be ignored
      act(() => {
        capturedState!.reconcile([repoNode], []);
      });

      // Feature should still be there
      expect(screen.getByTestId('node-count')).toHaveTextContent('2');
    });

    it('reconcile works again after endMutation cooldown expires', () => {
      vi.useFakeTimers();

      const repoNode = makeRepoNode('repo-1');
      const featureNode = makeFeatureNode('feat-abc', '/repo');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode, featureNode], [], (s) => {
        capturedState = s;
      });

      // Begin and end mutation
      act(() => {
        capturedState!.beginMutation();
      });
      act(() => {
        capturedState!.endMutation(1000);
      });

      // Still guarded during cooldown
      act(() => {
        capturedState!.reconcile([repoNode], []);
      });
      expect(screen.getByTestId('node-count')).toHaveTextContent('2');

      // After cooldown expires, reconcile should work
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      act(() => {
        capturedState!.reconcile([repoNode], []);
      });
      expect(screen.getByTestId('node-count')).toHaveTextContent('1');

      vi.useRealTimers();
    });

    it('isMutating returns correct state', () => {
      const repoNode = makeRepoNode('repo-1');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode], [], (s) => {
        capturedState = s;
      });

      expect(capturedState!.isMutating()).toBe(false);

      act(() => {
        capturedState!.beginMutation();
      });
      expect(capturedState!.isMutating()).toBe(true);
    });

    it('supports nested mutations (ref-counted)', () => {
      vi.useFakeTimers();

      const repoNode = makeRepoNode('repo-1');
      const featureNode = makeFeatureNode('feat-abc', '/repo');
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode, featureNode], [], (s) => {
        capturedState = s;
      });

      // Two nested mutations
      act(() => {
        capturedState!.beginMutation();
        capturedState!.beginMutation();
      });

      // End one — still guarded
      act(() => {
        capturedState!.endMutation(100);
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Still mutating (one outstanding)
      expect(capturedState!.isMutating()).toBe(true);

      act(() => {
        capturedState!.reconcile([repoNode], []);
      });
      expect(screen.getByTestId('node-count')).toHaveTextContent('2');

      // End second — now reconcile should work after cooldown
      act(() => {
        capturedState!.endMutation(100);
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(capturedState!.isMutating()).toBe(false);

      act(() => {
        capturedState!.reconcile([repoNode], []);
      });
      expect(screen.getByTestId('node-count')).toHaveTextContent('1');

      vi.useRealTimers();
    });

    it('updateFeature still works during mutation guard', () => {
      const repoNode = makeRepoNode('repo-1');
      const featureNode = makeFeatureNode('feat-abc', '/repo', { state: 'running' });
      let capturedState: UseGraphStateReturn | null = null;

      renderHook([repoNode, featureNode], [], (s) => {
        capturedState = s;
      });

      act(() => {
        capturedState!.beginMutation();
      });

      // SSE updates should still work during mutation guard
      act(() => {
        capturedState!.updateFeature('feat-abc', { state: 'done' });
      });

      const node = capturedState!.nodes.find((n) => n.id === 'feat-abc');
      expect((node?.data as FeatureNodeData).state).toBe('done');
    });
  });

  describe('relocateChildren', () => {
    it('reparents direct children to a new parent', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      const parentFeature = makeFeatureNode('feat-parent', '/repo');
      const childFeature = makeFeatureNode('feat-child', '/repo');
      const grandparentFeature = makeFeatureNode('feat-grandparent', '/repo');
      const depEdgeGpToParent: Edge = {
        id: 'dep-feat-grandparent-feat-parent',
        source: 'feat-grandparent',
        target: 'feat-parent',
        type: 'dependencyEdge',
      };
      const depEdgeParentToChild: Edge = {
        id: 'dep-feat-parent-feat-child',
        source: 'feat-parent',
        target: 'feat-child',
        type: 'dependencyEdge',
      };

      let capturedState: UseGraphStateReturn | null = null;
      renderHook(
        [repoNode, grandparentFeature, parentFeature, childFeature],
        [depEdgeGpToParent, depEdgeParentToChild],
        (s) => {
          capturedState = s;
        }
      );

      // Before: child has dependency edge from parent
      const depBefore = capturedState!.edges.find(
        (e) => e.type === 'dependencyEdge' && e.target === 'feat-child'
      );
      expect(depBefore?.source).toBe('feat-parent');

      // Relocate children of feat-parent to feat-grandparent
      act(() => {
        capturedState!.relocateChildren('feat-parent', 'feat-grandparent');
      });

      // After: child should have dependency edge from grandparent
      const depAfter = capturedState!.edges.find(
        (e) => e.type === 'dependencyEdge' && e.target === 'feat-child'
      );
      expect(depAfter?.source).toBe('feat-grandparent');
    });

    it('makes children root-level when new parent is undefined', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      const parentFeature = makeFeatureNode('feat-parent', '/repo');
      const childFeature = makeFeatureNode('feat-child', '/repo');
      const depEdge: Edge = {
        id: 'dep-feat-parent-feat-child',
        source: 'feat-parent',
        target: 'feat-child',
        type: 'dependencyEdge',
      };

      let capturedState: UseGraphStateReturn | null = null;
      renderHook([repoNode, parentFeature, childFeature], [depEdge], (s) => {
        capturedState = s;
      });

      // Before: child has dependency edge from parent
      const depBefore = capturedState!.edges.find(
        (e) => e.type === 'dependencyEdge' && e.target === 'feat-child'
      );
      expect(depBefore).toBeDefined();

      // Relocate children of feat-parent to no parent (root level)
      act(() => {
        capturedState!.relocateChildren('feat-parent');
      });

      // After: no dependency edge for child; should have repo→child edge instead
      const depAfter = capturedState!.edges.find(
        (e) => e.type === 'dependencyEdge' && e.target === 'feat-child'
      );
      expect(depAfter).toBeUndefined();

      const repoEdge = capturedState!.edges.find(
        (e) => e.source === 'repo-1' && e.target === 'feat-child'
      );
      expect(repoEdge).toBeDefined();
    });

    it('does not affect grandchildren (only direct children)', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      const parentFeature = makeFeatureNode('feat-parent', '/repo');
      const childFeature = makeFeatureNode('feat-child', '/repo');
      const grandchildFeature = makeFeatureNode('feat-grandchild', '/repo');
      const depEdgeParentToChild: Edge = {
        id: 'dep-feat-parent-feat-child',
        source: 'feat-parent',
        target: 'feat-child',
        type: 'dependencyEdge',
      };
      const depEdgeChildToGrandchild: Edge = {
        id: 'dep-feat-child-feat-grandchild',
        source: 'feat-child',
        target: 'feat-grandchild',
        type: 'dependencyEdge',
      };

      let capturedState: UseGraphStateReturn | null = null;
      renderHook(
        [repoNode, parentFeature, childFeature, grandchildFeature],
        [depEdgeParentToChild, depEdgeChildToGrandchild],
        (s) => {
          capturedState = s;
        }
      );

      // Relocate children of feat-parent to no parent
      act(() => {
        capturedState!.relocateChildren('feat-parent');
      });

      // Grandchild should still be under child
      const gcEdge = capturedState!.edges.find(
        (e) => e.type === 'dependencyEdge' && e.target === 'feat-grandchild'
      );
      expect(gcEdge?.source).toBe('feat-child');
    });

    it('removeFeatureAndRelocateChildren atomically removes parent and reparents children', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      const parentFeature = makeFeatureNode('feat-parent', '/repo');
      const childFeature = makeFeatureNode('feat-child', '/repo');
      const depEdge: Edge = {
        id: 'dep-feat-parent-feat-child',
        source: 'feat-parent',
        target: 'feat-child',
        type: 'dependencyEdge',
      };

      let capturedState: UseGraphStateReturn | null = null;
      renderHook([repoNode, parentFeature, childFeature], [depEdge], (s) => {
        capturedState = s;
      });

      // Before: 3 nodes, child has dependency edge from parent
      expect(screen.getByTestId('node-count')).toHaveTextContent('3');

      act(() => {
        capturedState!.removeFeatureAndRelocateChildren('feat-parent');
      });

      // After: parent removed, child reparented to repo (no parentNodeId → repositoryPath match)
      expect(screen.getByTestId('node-count')).toHaveTextContent('2');
      expect(capturedState!.nodes.find((n) => n.id === 'feat-parent')).toBeUndefined();

      // Child should have repo→child edge (not dependency edge)
      const depAfter = capturedState!.edges.find(
        (e) => e.type === 'dependencyEdge' && e.target === 'feat-child'
      );
      expect(depAfter).toBeUndefined();

      const repoEdge = capturedState!.edges.find(
        (e) => e.source === 'repo-1' && e.target === 'feat-child'
      );
      expect(repoEdge).toBeDefined();
    });

    it('removeFeatureAndRelocateChildren reparents to a specific new parent', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      const grandparentFeature = makeFeatureNode('feat-grandparent', '/repo');
      const parentFeature = makeFeatureNode('feat-parent', '/repo');
      const childFeature = makeFeatureNode('feat-child', '/repo');
      const depEdgeGpToParent: Edge = {
        id: 'dep-feat-grandparent-feat-parent',
        source: 'feat-grandparent',
        target: 'feat-parent',
        type: 'dependencyEdge',
      };
      const depEdgeParentToChild: Edge = {
        id: 'dep-feat-parent-feat-child',
        source: 'feat-parent',
        target: 'feat-child',
        type: 'dependencyEdge',
      };

      let capturedState: UseGraphStateReturn | null = null;
      renderHook(
        [repoNode, grandparentFeature, parentFeature, childFeature],
        [depEdgeGpToParent, depEdgeParentToChild],
        (s) => {
          capturedState = s;
        }
      );

      act(() => {
        capturedState!.removeFeatureAndRelocateChildren('feat-parent', 'feat-grandparent');
      });

      // Parent removed, child reparented to grandparent
      expect(capturedState!.nodes.find((n) => n.id === 'feat-parent')).toBeUndefined();
      const depAfter = capturedState!.edges.find(
        (e) => e.type === 'dependencyEdge' && e.target === 'feat-child'
      );
      expect(depAfter?.source).toBe('feat-grandparent');
    });

    it('removeFeatureAndRelocateChildren clears blockedBy and resets blocked state', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      const parentFeature = makeFeatureNode('feat-parent', '/repo');
      const childFeature = makeFeatureNode('feat-child', '/repo', {
        state: 'blocked',
        blockedBy: 'Parent Feature',
      });
      const depEdge: Edge = {
        id: 'dep-feat-parent-feat-child',
        source: 'feat-parent',
        target: 'feat-child',
        type: 'dependencyEdge',
      };

      let capturedState: UseGraphStateReturn | null = null;
      renderHook([repoNode, parentFeature, childFeature], [depEdge], (s) => {
        capturedState = s;
      });

      // Before: child is blocked
      const childBefore = capturedState!.nodes.find((n) => n.id === 'feat-child');
      expect((childBefore?.data as FeatureNodeData).state).toBe('blocked');
      expect((childBefore?.data as FeatureNodeData).blockedBy).toBe('Parent Feature');

      act(() => {
        capturedState!.removeFeatureAndRelocateChildren('feat-parent');
      });

      // After: child should be unblocked (blockedBy cleared, state reset)
      const childAfter = capturedState!.nodes.find((n) => n.id === 'feat-child');
      expect((childAfter?.data as FeatureNodeData).state).not.toBe('blocked');
      expect((childAfter?.data as FeatureNodeData).blockedBy).toBeUndefined();
    });

    it('getFeatureParentNodeId returns correct parent', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      const parentFeature = makeFeatureNode('feat-parent', '/repo');
      const childFeature = makeFeatureNode('feat-child', '/repo');
      const depEdge: Edge = {
        id: 'dep-feat-parent-feat-child',
        source: 'feat-parent',
        target: 'feat-child',
        type: 'dependencyEdge',
      };

      let capturedState: UseGraphStateReturn | null = null;
      renderHook([repoNode, parentFeature, childFeature], [depEdge], (s) => {
        capturedState = s;
      });

      expect(capturedState!.getFeatureParentNodeId('feat-child')).toBe('feat-parent');
      expect(capturedState!.getFeatureParentNodeId('feat-parent')).toBeUndefined();
      expect(capturedState!.getFeatureParentNodeId('feat-unknown')).toBeUndefined();
    });

    it('no-ops when parent has no children', () => {
      const repoNode = makeRepoNode('repo-1', '/repo');
      const featureNode = makeFeatureNode('feat-abc', '/repo');

      let capturedState: UseGraphStateReturn | null = null;
      renderHook([repoNode, featureNode], [], (s) => {
        capturedState = s;
      });

      const nodesBefore = capturedState!.nodes;

      act(() => {
        capturedState!.relocateChildren('feat-abc', 'feat-other');
      });

      // Should be reference-equal (no state change)
      expect(capturedState!.nodes).toBe(nodesBefore);
    });
  });

  describe('stable references', () => {
    it('nodes/edges have stable references when Maps do not change', () => {
      const repoNode = makeRepoNode('repo-1');
      let prevNodes: CanvasNodeType[] | null = null;
      let currentNodes: CanvasNodeType[] | null = null;

      const { rerender } = render(
        <HookHarness
          initialNodes={[repoNode]}
          initialEdges={[]}
          onState={(s) => {
            prevNodes = currentNodes;
            currentNodes = s.nodes;
          }}
        />
      );

      // Re-render with the SAME initialNodes (same reference)
      rerender(
        <HookHarness
          initialNodes={[repoNode]}
          initialEdges={[]}
          onState={(s) => {
            prevNodes = currentNodes;
            currentNodes = s.nodes;
          }}
        />
      );

      // nodes should be the same reference (useMemo not re-ran)
      expect(currentNodes).toBe(prevNodes);
    });
  });
});
