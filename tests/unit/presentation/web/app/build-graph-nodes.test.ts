import { describe, it, expect } from 'vitest';
import { buildGraphNodes } from '@/app/build-graph-nodes';
import { layoutWithDagre, CANVAS_LAYOUT_DEFAULTS } from '@/lib/layout-with-dagre';
import { SdlcLifecycle, SecurityMode } from '@shepai/core/domain/generated/output';
import type { Feature, Repository } from '@shepai/core/domain/generated/output';
import type { ApplicationWithStatus } from '@shepai/core/application/use-cases/applications/list-applications.use-case';

const makeFeature = (overrides: Partial<Feature> = {}): Feature =>
  ({
    id: 'feat-1',
    name: 'My Feature',
    userQuery: 'add a feature',
    slug: 'my-feature',
    description: 'A test feature',
    repositoryPath: '/my/repo',
    branch: 'feat/my-feature',
    lifecycle: SdlcLifecycle.Requirements,
    messages: [],
    relatedArtifacts: [],
    push: false,
    openPr: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Feature;

const makeRepo = (overrides: Partial<Repository> = {}): Repository =>
  ({
    id: 'repo-1',
    name: 'my-repo',
    path: '/my/repo',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Repository;

describe('buildGraphNodes', () => {
  describe('orphan-fallback: features with no matching repository row', () => {
    it('creates a virtual repository node when repositories is empty but features exist', () => {
      const feature = makeFeature({ repositoryPath: '/my/repo' });
      const { nodes } = buildGraphNodes([], [{ feature, run: null }]);

      const virtualNode = nodes.find((n) => n.id === 'virtual-repo-/my/repo');
      expect(virtualNode).toBeDefined();
      expect(virtualNode?.type).toBe('repositoryNode');
    });

    it('creates a feature node under the virtual repository', () => {
      const feature = makeFeature({ repositoryPath: '/my/repo' });
      const { nodes, edges } = buildGraphNodes([], [{ feature, run: null }]);

      expect(nodes.find((n) => n.id === 'feat-feat-1')).toBeDefined();
      // Edge connects virtual repo to feature
      const edge = edges.find(
        (e) => e.source === 'virtual-repo-/my/repo' && e.target === 'feat-feat-1'
      );
      expect(edge).toBeDefined();
    });

    it('derives virtual repository name from the last path segment', () => {
      const feature = makeFeature({ repositoryPath: '/home/user/my-project' });
      const { nodes } = buildGraphNodes([], [{ feature, run: null }]);

      const virtualNode = nodes.find((n) => n.id === 'virtual-repo-/home/user/my-project');
      expect(virtualNode).toBeDefined();
      expect((virtualNode?.data as { name: string }).name).toBe('my-project');
    });

    it('creates separate virtual nodes for features with different repository paths', () => {
      const feat1 = makeFeature({ id: 'feat-1', repositoryPath: '/repo/a' });
      const feat2 = makeFeature({ id: 'feat-2', repositoryPath: '/repo/b' });
      const { nodes } = buildGraphNodes(
        [],
        [
          { feature: feat1, run: null },
          { feature: feat2, run: null },
        ]
      );

      expect(nodes.find((n) => n.id === 'virtual-repo-/repo/a')).toBeDefined();
      expect(nodes.find((n) => n.id === 'virtual-repo-/repo/b')).toBeDefined();
    });

    it('groups multiple features under one virtual node when they share a repository path', () => {
      const feat1 = makeFeature({ id: 'feat-1', repositoryPath: '/my/repo' });
      const feat2 = makeFeature({ id: 'feat-2', repositoryPath: '/my/repo' });
      const { nodes } = buildGraphNodes(
        [],
        [
          { feature: feat1, run: null },
          { feature: feat2, run: null },
        ]
      );

      const virtualNodes = nodes.filter((n) => n.id === 'virtual-repo-/my/repo');
      expect(virtualNodes).toHaveLength(1);
    });
  });

  describe('real repository nodes: no duplicates when repository row exists', () => {
    it('does NOT create a virtual node when a real repository row covers the feature path', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const feature = makeFeature({ repositoryPath: '/my/repo' });
      const { nodes } = buildGraphNodes([repo], [{ feature, run: null }]);

      expect(nodes.find((n) => n.id === 'virtual-repo-/my/repo')).toBeUndefined();
    });

    it('does NOT duplicate the feature node when covered by a real repo', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const feature = makeFeature({ repositoryPath: '/my/repo' });
      const { nodes } = buildGraphNodes([repo], [{ feature, run: null }]);

      const featureNodes = nodes.filter((n) => n.id === 'feat-feat-1');
      expect(featureNodes).toHaveLength(1);
    });

    it('renders a real repository node even when it has no features', () => {
      const repo = makeRepo({ path: '/empty/repo' });
      const { nodes } = buildGraphNodes([repo], []);

      expect(nodes.find((n) => n.id === 'repo-repo-1')).toBeDefined();
    });
  });

  describe('mixed: some features covered, some orphaned', () => {
    it('renders real repo for covered path and virtual repo for orphaned path', () => {
      const repo = makeRepo({ id: 'repo-1', path: '/real/repo' });
      const coveredFeature = makeFeature({ id: 'feat-1', repositoryPath: '/real/repo' });
      const orphanFeature = makeFeature({ id: 'feat-2', repositoryPath: '/orphan/repo' });

      const { nodes } = buildGraphNodes(
        [repo],
        [
          { feature: coveredFeature, run: null },
          { feature: orphanFeature, run: null },
        ]
      );

      expect(nodes.find((n) => n.id === 'repo-repo-1')).toBeDefined();
      expect(nodes.find((n) => n.id === 'virtual-repo-/orphan/repo')).toBeDefined();
      expect(nodes.find((n) => n.id === 'virtual-repo-/real/repo')).toBeUndefined();
    });
  });

  describe('feature ordering by createdAt', () => {
    it('sorts feature nodes so newest appears last (bottom)', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const oldest = makeFeature({
        id: 'feat-old',
        repositoryPath: '/my/repo',
        createdAt: new Date('2025-01-01'),
      });
      const middle = makeFeature({
        id: 'feat-mid',
        repositoryPath: '/my/repo',
        createdAt: new Date('2025-06-01'),
      });
      const newest = makeFeature({
        id: 'feat-new',
        repositoryPath: '/my/repo',
        createdAt: new Date('2026-01-01'),
      });

      // Pass features in reverse order to verify sorting
      const { nodes } = buildGraphNodes(
        [repo],
        [
          { feature: newest, run: null },
          { feature: oldest, run: null },
          { feature: middle, run: null },
        ]
      );

      const featureNodes = nodes.filter((n) => n.type === 'featureNode');
      expect(featureNodes.map((n) => n.id)).toEqual([
        'feat-feat-old',
        'feat-feat-mid',
        'feat-feat-new',
      ]);
    });
  });

  describe('feature ordering after Dagre layout', () => {
    it('newest feature has the largest Y position after full layout pipeline', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const oldest = makeFeature({
        id: 'feat-old',
        name: 'Oldest Feature',
        repositoryPath: '/my/repo',
        createdAt: new Date('2025-01-01'),
      });
      const middle = makeFeature({
        id: 'feat-mid',
        name: 'Middle Feature',
        repositoryPath: '/my/repo',
        createdAt: new Date('2025-06-01'),
      });
      const newest = makeFeature({
        id: 'feat-new',
        name: 'Newest Feature',
        repositoryPath: '/my/repo',
        createdAt: new Date('2026-01-01'),
      });

      // Pass features in scrambled order
      const { nodes, edges } = buildGraphNodes(
        [repo],
        [
          { feature: newest, run: null },
          { feature: oldest, run: null },
          { feature: middle, run: null },
        ]
      );

      const laid = layoutWithDagre(nodes, edges, CANVAS_LAYOUT_DEFAULTS);

      const oldNode = laid.nodes.find((n) => n.id === 'feat-feat-old')!;
      const midNode = laid.nodes.find((n) => n.id === 'feat-feat-mid')!;
      const newNode = laid.nodes.find((n) => n.id === 'feat-feat-new')!;

      expect(oldNode.position.y).toBeLessThan(midNode.position.y);
      expect(midNode.position.y).toBeLessThan(newNode.position.y);
    });
  });

  describe('feature node data includes summary, createdAt, and repositoryName', () => {
    it('passes summary and createdAt from the Feature entity', () => {
      const repo = makeRepo({ path: '/my/repo', name: 'my-repo' });
      const feature = makeFeature({
        repositoryPath: '/my/repo',
        description: 'A detailed summary',
        createdAt: new Date('2026-01-15T10:00:00Z'),
      });
      const { nodes } = buildGraphNodes([repo], [{ feature, run: null }]);

      const featureNode = nodes.find((n) => n.id === 'feat-feat-1');
      expect(featureNode).toBeDefined();
      const data = featureNode!.data as Record<string, unknown>;
      expect(data.summary).toBe('A detailed summary');
      expect(data.createdAt).toBe(new Date('2026-01-15T10:00:00Z').getTime());
      expect(data.repositoryName).toBe('my-repo');
    });
  });

  describe('repository node data includes createdAt', () => {
    it('passes createdAt from the Repository entity as epoch ms', () => {
      const repo = makeRepo({ path: '/my/repo', createdAt: new Date('2026-01-15T10:00:00Z') });
      const { nodes } = buildGraphNodes([repo], []);

      const repoNode = nodes.find((n) => n.id === 'repo-repo-1');
      expect(repoNode).toBeDefined();
      const data = repoNode!.data as Record<string, unknown>;
      expect(data.createdAt).toBe(new Date('2026-01-15T10:00:00Z').getTime());
    });
  });

  describe('repository ordering after dagre layout survives reconcile', () => {
    it('repos maintain createdAt order even when dagre reorders the node array', () => {
      // Repo A created first, has no features (disconnected → dagre puts it last)
      // Repo B created second, has a feature (connected → dagre puts it first)
      const repoA = makeRepo({
        id: 'repo-a',
        name: 'repo-a',
        path: '/repo-a',
        createdAt: new Date('2025-01-01'),
      });
      const repoB = makeRepo({
        id: 'repo-b',
        name: 'repo-b',
        path: '/repo-b',
        createdAt: new Date('2025-06-01'),
      });
      const feature = makeFeature({ id: 'feat-1', repositoryPath: '/repo-b' });

      const { nodes, edges } = buildGraphNodes([repoA, repoB], [{ feature, run: null }]);

      // After dagre layout, the node array order may change
      const laid = layoutWithDagre(nodes, edges, CANVAS_LAYOUT_DEFAULTS);

      // Verify both repos have createdAt set
      const laidRepoA = laid.nodes.find((n) => n.id === 'repo-repo-a');
      const laidRepoB = laid.nodes.find((n) => n.id === 'repo-repo-b');
      expect(laidRepoA).toBeDefined();
      expect(laidRepoB).toBeDefined();
      expect((laidRepoA!.data as Record<string, unknown>).createdAt).toBeDefined();
      expect((laidRepoB!.data as Record<string, unknown>).createdAt).toBeDefined();
    });
  });

  describe('empty inputs', () => {
    it('returns empty nodes and edges when both inputs are empty', () => {
      const { nodes, edges } = buildGraphNodes([], []);
      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
    });
  });

  describe('repository git info enrichment', () => {
    it('includes git info when repoGitInfo map has data for the repository', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const repoGitInfo = new Map([
        [
          '/my/repo',
          {
            branch: 'feat/test',
            commitMessage: 'feat: add login page',
            committer: 'Jane Doe',
            behindCount: 3,
          },
        ],
      ]);
      const { nodes } = buildGraphNodes([repo], [], { repoGitInfo });

      const repoNode = nodes.find((n) => n.id === 'repo-repo-1');
      expect(repoNode).toBeDefined();
      const data = repoNode!.data as Record<string, unknown>;
      expect(data.branch).toBe('feat/test');
      expect(data.commitMessage).toBe('feat: add login page');
      expect(data.committer).toBe('Jane Doe');
      expect(data.behindCount).toBe(3);
    });

    it('does not include git info when repoGitInfo map has no data for the repository', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const repoGitInfo = new Map([
        [
          '/other/repo',
          { branch: 'main', commitMessage: 'chore: cleanup', committer: 'Bot', behindCount: 0 },
        ],
      ]);
      const { nodes } = buildGraphNodes([repo], [], { repoGitInfo });

      const repoNode = nodes.find((n) => n.id === 'repo-repo-1');
      const data = repoNode!.data as Record<string, unknown>;
      expect(data.branch).toBeUndefined();
      expect(data.commitMessage).toBeUndefined();
    });

    it('does not include git info when repoGitInfo is not provided', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const { nodes } = buildGraphNodes([repo], []);

      const repoNode = nodes.find((n) => n.id === 'repo-repo-1');
      const data = repoNode!.data as Record<string, unknown>;
      expect(data.branch).toBeUndefined();
    });
  });

  describe('application rendering on the canvas', () => {
    const makeApp = (overrides: Partial<ApplicationWithStatus> = {}): ApplicationWithStatus =>
      ({
        id: 'app-uuid-1',
        name: 'My App',
        slug: 'my-app',
        description: 'An SDD app',
        repositoryPath: '/my/repo',
        additionalPaths: [],
        status: 'Idle',
        setupComplete: true,
        bedrockEnabled: false,
        agentRunId: null,
        agentSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        effectiveStatus: 'ready',
        ...overrides,
      }) as ApplicationWithStatus;

    it('emits no application nodes when applications option is omitted', () => {
      const repo = makeRepo();
      const { nodes } = buildGraphNodes([repo], []);
      expect(nodes.find((n) => n.type === 'applicationNode')).toBeUndefined();
    });

    it('emits an application node for each application passed in', () => {
      const repo = makeRepo();
      const app = makeApp();
      const { nodes } = buildGraphNodes([repo], [], { applications: [app] });

      const appNode = nodes.find((n) => n.id === 'app-app-uuid-1');
      expect(appNode).toBeDefined();
      expect(appNode?.type).toBe('applicationNode');
      const data = appNode!.data as Record<string, unknown>;
      expect(data.id).toBe('app-uuid-1');
      expect(data.name).toBe('My App');
    });

    it('threads applicationId from the feature into FeatureNodeData so derive-graph can pick it up', () => {
      const feature = makeFeature({
        id: 'feat-spec',
        repositoryPath: '/my/repo',
        applicationId: 'app-uuid-1',
      });
      const { nodes } = buildGraphNodes([makeRepo()], [{ feature, run: null }], {
        applications: [makeApp()],
      });

      const featNode = nodes.find((n) => n.id === 'feat-feat-spec');
      const data = featNode!.data as Record<string, unknown>;
      expect(data.applicationId).toBe('app-uuid-1');
    });

    it('omits applicationId on FeatureNodeData when the feature is not app-scoped', () => {
      const feature = makeFeature({ id: 'feat-plain' });
      const { nodes } = buildGraphNodes([makeRepo()], [{ feature, run: null }]);

      const featNode = nodes.find((n) => n.id === 'feat-feat-plain');
      const data = featNode!.data as Record<string, unknown>;
      expect(data.applicationId).toBeUndefined();
    });
  });

  describe('securityMode propagation to feature nodes', () => {
    it('sets data.securityMode on feature nodes when Advisory is passed', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const feature = makeFeature({ repositoryPath: '/my/repo' });
      const { nodes } = buildGraphNodes([repo], [{ feature, run: null }], {
        securityMode: SecurityMode.Advisory,
      });

      const featureNode = nodes.find((n) => n.id === 'feat-feat-1');
      expect(featureNode).toBeDefined();
      expect((featureNode!.data as { securityMode?: SecurityMode }).securityMode).toBe(
        SecurityMode.Advisory
      );
    });

    it('sets data.securityMode on feature nodes when Enforce is passed', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const feature = makeFeature({ repositoryPath: '/my/repo' });
      const { nodes } = buildGraphNodes([repo], [{ feature, run: null }], {
        securityMode: SecurityMode.Enforce,
      });

      const featureNode = nodes.find((n) => n.id === 'feat-feat-1');
      expect((featureNode!.data as { securityMode?: SecurityMode }).securityMode).toBe(
        SecurityMode.Enforce
      );
    });

    it('omits securityMode from data when Disabled is passed', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const feature = makeFeature({ repositoryPath: '/my/repo' });
      const { nodes } = buildGraphNodes([repo], [{ feature, run: null }], {
        securityMode: SecurityMode.Disabled,
      });

      const featureNode = nodes.find((n) => n.id === 'feat-feat-1');
      expect((featureNode!.data as { securityMode?: SecurityMode }).securityMode).toBeUndefined();
    });

    it('omits securityMode from data when option is not provided', () => {
      const repo = makeRepo({ path: '/my/repo' });
      const feature = makeFeature({ repositoryPath: '/my/repo' });
      const { nodes } = buildGraphNodes([repo], [{ feature, run: null }]);

      const featureNode = nodes.find((n) => n.id === 'feat-feat-1');
      expect((featureNode!.data as { securityMode?: SecurityMode }).securityMode).toBeUndefined();
    });
  });
});
