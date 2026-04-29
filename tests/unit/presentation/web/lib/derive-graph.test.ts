import { describe, it, expect, vi } from 'vitest';
import { deriveGraph } from '@/lib/derive-graph';
import type { FeatureEntry, RepoEntry, ApplicationEntry, GraphCallbacks } from '@/lib/derive-graph';
import type { FeatureNodeData } from '@/components/common/feature-node';
import type { RepositoryNodeData } from '@/components/common/repository-node';
import type { ApplicationNodeData } from '@/components/common/application-node/application-node-config';

// --- Helpers ---

function makeFeatureEntry(
  nodeId: string,
  overrides: Partial<FeatureNodeData> = {},
  parentNodeId?: string
): [string, FeatureEntry] {
  return [
    nodeId,
    {
      nodeId,
      data: {
        name: 'Test Feature',
        featureId: nodeId,
        lifecycle: 'requirements',
        state: 'running',
        progress: 0,
        repositoryPath: '/home/user/my-repo',
        branch: 'feat/test',
        ...overrides,
      },
      parentNodeId,
    },
  ];
}

function makeRepoEntry(
  nodeId: string,
  repositoryPath: string,
  name = 'my-repo',
  createdAt?: number
): [string, RepoEntry] {
  return [
    nodeId,
    {
      nodeId,
      data: {
        name,
        repositoryPath,
        id: nodeId.replace('repo-', ''),
        ...(createdAt !== undefined && { createdAt }),
      } as RepositoryNodeData,
    },
  ];
}

function makeApplicationEntry(
  nodeId: string,
  applicationId: string,
  overrides: Partial<ApplicationNodeData> = {}
): [string, ApplicationEntry] {
  return [
    nodeId,
    {
      nodeId,
      data: {
        id: applicationId,
        name: 'Test App',
        description: 'A test application',
        status: 'Idle',
        repositoryPath: '/home/user/test-app',
        additionalPathCount: 0,
        ...overrides,
      },
    },
  ];
}

// --- Tests: Task 1 (derive-graph pure derivation) ---

describe('deriveGraph', () => {
  describe('basic node and edge derivation', () => {
    it('single feature + repo → produces feature node + repo node + repo→feature edge', () => {
      const featureMap = new Map([makeFeatureEntry('feat-abc', { repositoryPath: '/repo' })]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();

      const { nodes, edges } = deriveGraph(featureMap, repoMap, pendingMap);

      expect(nodes).toHaveLength(2);
      expect(nodes.find((n) => n.id === 'feat-abc')).toBeDefined();
      expect(nodes.find((n) => n.id === 'repo-1')).toBeDefined();

      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({
        source: 'repo-1',
        target: 'feat-abc',
      });
    });

    it('feature with parentNodeId → produces dependency edge, no repo→feature edge', () => {
      const featureMap = new Map([
        makeFeatureEntry('feat-parent', { repositoryPath: '/repo' }),
        makeFeatureEntry('feat-child', { repositoryPath: '/repo' }, 'feat-parent'),
      ]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();

      const { edges } = deriveGraph(featureMap, repoMap, pendingMap);

      // parent → repo edge exists, child → dep edge exists, NO repo→child edge
      const depEdge = edges.find((e) => e.type === 'dependencyEdge');
      expect(depEdge).toBeDefined();
      expect(depEdge).toMatchObject({
        source: 'feat-parent',
        target: 'feat-child',
        type: 'dependencyEdge',
      });

      const repoToChild = edges.find((e) => e.source === 'repo-1' && e.target === 'feat-child');
      expect(repoToChild).toBeUndefined();

      const repoToParent = edges.find((e) => e.source === 'repo-1' && e.target === 'feat-parent');
      expect(repoToParent).toBeDefined();
    });

    it('orphan feature (no repo match) → produces virtual repo node', () => {
      const featureMap = new Map([
        makeFeatureEntry('feat-orphan', { repositoryPath: '/orphan/repo' }),
      ]);
      const repoMap = new Map<string, RepoEntry>();
      const pendingMap = new Map<string, FeatureEntry>();

      const { nodes, edges } = deriveGraph(featureMap, repoMap, pendingMap);

      const virtualRepo = nodes.find((n) => n.id.startsWith('virtual-repo-'));
      expect(virtualRepo).toBeDefined();
      expect(virtualRepo?.type).toBe('repositoryNode');

      const edge = edges.find((e) => e.target === 'feat-orphan');
      expect(edge).toBeDefined();
      expect(edge?.source).toMatch(/^virtual-repo-/);
    });

    it('pending feature with tempId → produces creating node with edge to repo', () => {
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const featureMap = new Map<string, FeatureEntry>();
      const pendingMap = new Map([
        makeFeatureEntry('feature-temp-123', { state: 'creating', repositoryPath: '/repo' }),
      ]);

      const { nodes, edges } = deriveGraph(featureMap, repoMap, pendingMap);

      const pendingNode = nodes.find((n) => n.id === 'feature-temp-123');
      expect(pendingNode).toBeDefined();
      expect(pendingNode?.type).toBe('featureNode');
      expect((pendingNode?.data as FeatureNodeData).state).toBe('creating');

      const edge = edges.find((e) => e.target === 'feature-temp-123');
      expect(edge).toBeDefined();
      expect(edge?.source).toBe('repo-1');
    });

    it('lifecycle and state are preserved from FeatureNodeData', () => {
      const featureMap = new Map([
        makeFeatureEntry('feat-abc', {
          state: 'action-required',
          lifecycle: 'review',
          progress: 75,
          repositoryPath: '/home/user/my-repo',
        }),
      ]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/home/user/my-repo')]);
      const pendingMap = new Map<string, FeatureEntry>();

      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap);

      const featureNode = nodes.find((n) => n.id === 'feat-abc');
      const data = featureNode?.data as FeatureNodeData;
      expect(data.state).toBe('action-required');
      expect(data.lifecycle).toBe('review');
      expect(data.progress).toBe(75);
    });

    it('showHandles is true when edges exist', () => {
      const featureMap = new Map([makeFeatureEntry('feat-abc', { repositoryPath: '/repo' })]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();

      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap);

      const featureNode = nodes.find((n) => n.id === 'feat-abc');
      expect((featureNode?.data as FeatureNodeData).showHandles).toBe(true);
    });

    it('showHandles is false when no edges', () => {
      const featureMap = new Map<string, FeatureEntry>();
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();

      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap);

      const repoNode = nodes.find((n) => n.id === 'repo-1');
      expect((repoNode?.data as RepositoryNodeData).showHandles).toBe(false);
    });
  });

  describe('hasChildren flag', () => {
    it('sets hasChildren=true for parent feature nodes', () => {
      const featureMap = new Map([
        makeFeatureEntry('feat-parent', { repositoryPath: '/repo' }),
        makeFeatureEntry('feat-child', { repositoryPath: '/repo' }, 'feat-parent'),
      ]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();

      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap);

      const parentNode = nodes.find((n) => n.id === 'feat-parent');
      expect((parentNode?.data as FeatureNodeData).hasChildren).toBe(true);
    });

    it('sets hasChildren=false for leaf feature nodes', () => {
      const featureMap = new Map([
        makeFeatureEntry('feat-parent', { repositoryPath: '/repo' }),
        makeFeatureEntry('feat-child', { repositoryPath: '/repo' }, 'feat-parent'),
      ]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();

      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap);

      const childNode = nodes.find((n) => n.id === 'feat-child');
      expect((childNode?.data as FeatureNodeData).hasChildren).toBe(false);
    });

    it('sets hasChildren=false for standalone feature with no children', () => {
      const featureMap = new Map([makeFeatureEntry('feat-abc', { repositoryPath: '/repo' })]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();

      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap);

      const featureNode = nodes.find((n) => n.id === 'feat-abc');
      expect((featureNode?.data as FeatureNodeData).hasChildren).toBe(false);
    });
  });

  describe('duplicate ID dedup (featureMap vs pendingMap)', () => {
    it('when same ID exists in both featureMap and pendingMap, featureMap wins', () => {
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);

      // featureMap has the real, updated version (e.g. after reconcile)
      const featureMap = new Map([
        makeFeatureEntry('feat-abc', {
          state: 'action-required',
          lifecycle: 'requirements',
          name: 'AI Generated Name',
          repositoryPath: '/repo',
        }),
      ]);

      // pendingMap still has the stale optimistic version
      const pendingMap = new Map([
        makeFeatureEntry('feat-abc', {
          state: 'creating',
          lifecycle: 'requirements',
          name: 'User Typed Name',
          repositoryPath: '/repo',
        }),
      ]);

      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap);

      // Should be exactly ONE node for feat-abc, not two
      const featureNodes = nodes.filter((n) => n.id === 'feat-abc');
      expect(featureNodes).toHaveLength(1);

      // And it should use featureMap's data (action-required), not pendingMap's (creating)
      const data = featureNodes[0].data as FeatureNodeData;
      expect(data.state).toBe('action-required');
      expect(data.name).toBe('AI Generated Name');
    });
  });

  // --- Tests: Task 2 (callback injection) ---

  describe('callback injection', () => {
    it('callbacks injected into feature node data when provided', () => {
      const featureMap = new Map([makeFeatureEntry('feat-abc', { repositoryPath: '/repo' })]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();

      const onNodeAction = vi.fn();
      const onNodeSettings = vi.fn();
      const onFeatureDelete = vi.fn();

      const callbacks: GraphCallbacks = { onNodeAction, onNodeSettings, onFeatureDelete };
      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap, callbacks);

      const featureNode = nodes.find((n) => n.id === 'feat-abc');
      const data = featureNode?.data as FeatureNodeData;

      expect(data.onAction).toBeDefined();
      expect(data.onSettings).toBeDefined();
      expect(data.onDelete).toBeDefined();

      // Call the injected callbacks
      data.onAction!();
      expect(onNodeAction).toHaveBeenCalledWith('feat-abc');

      data.onSettings!();
      expect(onNodeSettings).toHaveBeenCalledWith('feat-abc');

      data.onDelete!('abc');
      expect(onFeatureDelete).toHaveBeenCalledWith('abc');
    });

    it('creating feature nodes skip onAction/onSettings', () => {
      const featureMap = new Map<string, FeatureEntry>();
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map([
        makeFeatureEntry('feature-temp-123', { state: 'creating', repositoryPath: '/repo' }),
      ]);

      const callbacks: GraphCallbacks = {
        onNodeAction: vi.fn(),
        onNodeSettings: vi.fn(),
      };
      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap, callbacks);

      const creatingNode = nodes.find((n) => n.id === 'feature-temp-123');
      const data = creatingNode?.data as FeatureNodeData;
      expect(data.onAction).toBeUndefined();
      expect(data.onSettings).toBeUndefined();
    });

    it('repos are sorted by createdAt regardless of Map insertion order', () => {
      // Insert repos in reverse creation order (simulates dagre reordering the array)
      const repoMap = new Map([
        makeRepoEntry('repo-3', '/repo-c', 'repo-c', 3000),
        makeRepoEntry('repo-1', '/repo-a', 'repo-a', 1000),
        makeRepoEntry('repo-2', '/repo-b', 'repo-b', 2000),
      ]);
      const featureMap = new Map<string, FeatureEntry>();
      const pendingMap = new Map<string, FeatureEntry>();

      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap);

      const repoNodes = nodes.filter((n) => n.type === 'repositoryNode');
      expect(repoNodes.map((n) => n.id)).toEqual(['repo-1', 'repo-2', 'repo-3']);
    });

    it('repo nodes get onAdd/onClick/onDelete callbacks', () => {
      const featureMap = new Map<string, FeatureEntry>();
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();

      const onRepositoryAdd = vi.fn();
      const onRepositoryClick = vi.fn();
      const onRepositoryDelete = vi.fn();

      const callbacks: GraphCallbacks = { onRepositoryAdd, onRepositoryClick, onRepositoryDelete };
      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap, callbacks);

      const repoNode = nodes.find((n) => n.id === 'repo-1');
      const data = repoNode?.data as RepositoryNodeData;

      expect(data.onAdd).toBeDefined();
      expect(data.onClick).toBeDefined();
      expect(data.onDelete).toBeDefined();

      data.onAdd!();
      expect(onRepositoryAdd).toHaveBeenCalledWith('repo-1');

      data.onClick!();
      expect(onRepositoryClick).toHaveBeenCalledWith('repo-1');
    });
  });

  // --- Tests: Phase 6 (applicationMap derivation + parent edges) ---

  describe('applicationMap derivation', () => {
    it('no applications passed → output is identical to current behavior (no app nodes/edges)', () => {
      const featureMap = new Map([makeFeatureEntry('feat-abc', { repositoryPath: '/repo' })]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();

      const without = deriveGraph(featureMap, repoMap, pendingMap);
      const withEmpty = deriveGraph(
        featureMap,
        repoMap,
        pendingMap,
        undefined,
        new Map<string, ApplicationEntry>()
      );

      expect(without.nodes).toHaveLength(2);
      expect(without.edges).toHaveLength(1);
      expect(withEmpty.nodes).toHaveLength(2);
      expect(withEmpty.edges).toHaveLength(1);

      // No application nodes either way
      expect(without.nodes.find((n) => n.type === 'applicationNode')).toBeUndefined();
      expect(withEmpty.nodes.find((n) => n.type === 'applicationNode')).toBeUndefined();
    });

    it('emits an ApplicationNode for every application in applicationMap', () => {
      const featureMap = new Map<string, FeatureEntry>();
      const repoMap = new Map<string, RepoEntry>();
      const pendingMap = new Map<string, FeatureEntry>();
      const applicationMap = new Map([
        makeApplicationEntry('app-node-1', 'app-uuid-1', { name: 'Dashboard' }),
        makeApplicationEntry('app-node-2', 'app-uuid-2', { name: 'Auth Service' }),
      ]);

      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap, undefined, applicationMap);

      const appNodes = nodes.filter((n) => n.type === 'applicationNode');
      expect(appNodes).toHaveLength(2);
      expect(appNodes.map((n) => n.id)).toEqual(['app-node-1', 'app-node-2']);
    });

    it('feature with applicationId set → app→feature dep edge instead of repo→feature edge', () => {
      const featureMap = new Map([
        [
          'feat-spec',
          {
            nodeId: 'feat-spec',
            data: {
              name: 'Spec feature',
              featureId: 'feat-spec',
              lifecycle: 'requirements',
              state: 'running',
              progress: 0,
              repositoryPath: '/home/user/test-app',
              branch: 'feat/spec',
            } as FeatureNodeData,
            applicationId: 'app-uuid-1',
          } satisfies FeatureEntry,
        ],
      ]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/home/user/test-app')]);
      const pendingMap = new Map<string, FeatureEntry>();
      const applicationMap = new Map([makeApplicationEntry('app-node-1', 'app-uuid-1')]);

      const { nodes, edges } = deriveGraph(
        featureMap,
        repoMap,
        pendingMap,
        undefined,
        applicationMap
      );

      // ApplicationNode is on the canvas
      expect(nodes.find((n) => n.id === 'app-node-1')?.type).toBe('applicationNode');

      // App→feature dependency edge present
      const appEdge = edges.find(
        (e) => e.source === 'app-node-1' && e.target === 'feat-spec' && e.type === 'dependencyEdge'
      );
      expect(appEdge).toBeDefined();

      // No repo→feature edge for this feature (the app edge replaces it)
      const repoEdge = edges.find((e) => e.source === 'repo-1' && e.target === 'feat-spec');
      expect(repoEdge).toBeUndefined();
    });

    it('feature with applicationId=null → no app→feature edge, repo→feature edge instead', () => {
      const featureMap = new Map([makeFeatureEntry('feat-plain', { repositoryPath: '/repo' })]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();
      const applicationMap = new Map([
        makeApplicationEntry('app-node-1', 'app-uuid-1', { repositoryPath: '/other-repo' }),
      ]);

      const { nodes, edges } = deriveGraph(
        featureMap,
        repoMap,
        pendingMap,
        undefined,
        applicationMap
      );

      // ApplicationNode still emitted
      expect(nodes.find((n) => n.id === 'app-node-1')?.type).toBe('applicationNode');

      // No app→feature edge (feature has no applicationId)
      const appEdge = edges.find((e) => e.source === 'app-node-1' && e.target === 'feat-plain');
      expect(appEdge).toBeUndefined();

      // Standard repo→feature edge present
      const repoEdge = edges.find((e) => e.source === 'repo-1' && e.target === 'feat-plain');
      expect(repoEdge).toBeDefined();
    });

    it('feature with applicationId but no matching app in map → falls back to repo→feature edge', () => {
      const featureMap = new Map([
        [
          'feat-orphaned',
          {
            nodeId: 'feat-orphaned',
            data: {
              name: 'Orphaned',
              featureId: 'feat-orphaned',
              lifecycle: 'requirements',
              state: 'running',
              progress: 0,
              repositoryPath: '/repo',
              branch: 'feat/orphan',
            } as FeatureNodeData,
            applicationId: 'unknown-app',
          } satisfies FeatureEntry,
        ],
      ]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();
      const applicationMap = new Map<string, ApplicationEntry>();

      const { edges } = deriveGraph(featureMap, repoMap, pendingMap, undefined, applicationMap);

      const appEdge = edges.find(
        (e) => e.target === 'feat-orphaned' && e.type === 'dependencyEdge'
      );
      expect(appEdge).toBeUndefined();

      const repoEdge = edges.find((e) => e.source === 'repo-1' && e.target === 'feat-orphaned');
      expect(repoEdge).toBeDefined();
    });

    it('parentNodeId takes priority over applicationId for edge derivation', () => {
      const featureMap = new Map([
        makeFeatureEntry('feat-parent', { repositoryPath: '/repo' }),
        [
          'feat-child',
          {
            nodeId: 'feat-child',
            data: {
              name: 'Child',
              featureId: 'feat-child',
              lifecycle: 'requirements',
              state: 'running',
              progress: 0,
              repositoryPath: '/repo',
              branch: 'feat/child',
            } as FeatureNodeData,
            parentNodeId: 'feat-parent',
            applicationId: 'app-uuid-1',
          } satisfies FeatureEntry,
        ],
      ]);
      const repoMap = new Map([makeRepoEntry('repo-1', '/repo')]);
      const pendingMap = new Map<string, FeatureEntry>();
      const applicationMap = new Map([makeApplicationEntry('app-node-1', 'app-uuid-1')]);

      const { edges } = deriveGraph(featureMap, repoMap, pendingMap, undefined, applicationMap);

      // Parent→child dep edge wins
      const parentEdge = edges.find((e) => e.source === 'feat-parent' && e.target === 'feat-child');
      expect(parentEdge).toBeDefined();

      // No app→child edge
      const appEdge = edges.find((e) => e.source === 'app-node-1' && e.target === 'feat-child');
      expect(appEdge).toBeUndefined();
    });

    it('application callbacks are injected into application node data', () => {
      const featureMap = new Map<string, FeatureEntry>();
      const repoMap = new Map<string, RepoEntry>();
      const pendingMap = new Map<string, FeatureEntry>();
      const applicationMap = new Map([makeApplicationEntry('app-node-1', 'app-uuid-1')]);

      const onApplicationClick = vi.fn();
      const onApplicationDelete = vi.fn();
      const callbacks: GraphCallbacks = { onApplicationClick, onApplicationDelete };

      const { nodes } = deriveGraph(featureMap, repoMap, pendingMap, callbacks, applicationMap);

      const appNode = nodes.find((n) => n.id === 'app-node-1');
      const data = appNode?.data as ApplicationNodeData;
      expect(data.onClick).toBeDefined();
      expect(data.onDelete).toBeDefined();

      data.onClick!();
      expect(onApplicationClick).toHaveBeenCalledWith('app-uuid-1');

      data.onDelete!('app-uuid-1');
      expect(onApplicationDelete).toHaveBeenCalledWith('app-uuid-1');
    });
  });
});
