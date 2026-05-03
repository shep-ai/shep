import type { Feature, Repository, AgentRun } from '@shepai/core/domain/generated/output';
import { AgentRunStatus } from '@shepai/core/domain/generated/output';
import {
  deriveNodeState,
  deriveProgress,
  deriveLifecycle,
} from '@/components/common/feature-node/derive-feature-state';
import { isProcessAlive } from '@shepai/core/infrastructure/services/process/is-process-alive';
import { computeWorktreePath } from '@shepai/core/infrastructure/services/ide-launchers/compute-worktree-path';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { Edge } from '@xyflow/react';
import type { FeatureNodeData } from '@/components/common/feature-node';
import type { ApplicationNodeData } from '@/components/common/application-node/application-node-config';
import type { ApplicationWithStatus } from '@shepai/core/application/use-cases/applications/list-applications.use-case';

export interface FeatureWithRun {
  feature: Feature;
  run: AgentRun | null;
}

/**
 * Builds React Flow nodes and edges from persisted repositories and features.
 *
 * Features whose repositoryPath is not covered by any real repository row are
 * grouped under a synthetic "virtual" repository node
 * (id: `virtual-repo-${repositoryPath}`). This ensures the dashboard never
 * renders empty when features exist but their repository rows are missing.
 */
export interface BuildGraphNodesOptions {
  /** Whether evidence collection is enabled (global workflow setting) */
  enableEvidence?: boolean;
  /** Whether evidence is committed to the PR body (global workflow setting) */
  commitEvidence?: boolean;
  /** Whether CI watch/fix loop is enabled (global workflow setting) */
  ciWatchEnabled?: boolean;
  /** Git info (branch, commit message, committer, behind count) keyed by repository path */
  repoGitInfo?: Map<
    string,
    { branch: string; commitMessage: string; committer: string; behindCount: number | null }
  >;
  /** Git info resolution status keyed by repository path */
  repoGitStatus?: Map<string, 'loading' | 'ready' | 'not-a-repo'>;
  /** Applications to render on the canvas. Callers are expected to filter
   *  this list to only include applications that are referenced by at least
   *  one feature's `applicationId` so the canvas stays uncluttered for users
   *  who do not use SDD mode. */
  applications?: ApplicationWithStatus[];
}

export function buildGraphNodes(
  repositories: Repository[],
  featuresWithRuns: FeatureWithRun[],
  options?: BuildGraphNodesOptions
): { nodes: CanvasNodeType[]; edges: Edge[] } {
  // Normalize path separators so Windows backslash paths match forward-slash paths
  const normalizePath = (p: string) => p.replace(/\\/g, '/');

  // App-scoped features attach to their parent application node, not to a
  // repository — the client's `derive-graph` emits an app→feature edge from
  // `Feature.applicationId`. We must NOT group them under `featuresByRepo`,
  // otherwise the second-pass virtual-repo loop would invent a duplicate
  // `repositoryNode` for the application's repo path and attach the feature
  // there instead.
  const renderedAppIds = new Set<string>();
  for (const app of options?.applications ?? []) {
    renderedAppIds.add(app.id);
  }

  // Group features by normalized repository path, except app-scoped ones.
  // App-scoped features are emitted standalone below; the client wires them
  // to their application via `applicationId` in the feature node data.
  const featuresByRepo: Record<string, FeatureWithRun[]> = {};
  const appScopedFeatures: FeatureWithRun[] = [];
  featuresWithRuns.forEach((entry) => {
    if (entry.feature.applicationId && renderedAppIds.has(entry.feature.applicationId)) {
      appScopedFeatures.push(entry);
      return;
    }
    const repoKey = normalizePath(entry.feature.repositoryPath);
    if (!featuresByRepo[repoKey]) {
      featuresByRepo[repoKey] = [];
    }
    featuresByRepo[repoKey].push(entry);
  });

  const nodes: CanvasNodeType[] = [];
  const edges: Edge[] = [];

  // Track which repository paths have been rendered (to avoid orphan duplicates)
  const coveredPaths = new Set<string>();

  // First, add nodes for all persisted repositories (including those without features)
  for (const repo of repositories) {
    const normalizedRepoPath = normalizePath(repo.path);
    coveredPaths.add(normalizedRepoPath);
    const repoNodeId = `repo-${repo.id}`;
    const gitInfo = options?.repoGitInfo?.get(repo.path);
    const gitInfoStatus = options?.repoGitStatus?.get(repo.path) ?? 'loading';
    nodes.push({
      id: repoNodeId,
      type: 'repositoryNode',
      position: { x: 0, y: 0 },
      data: {
        name: repo.name,
        repositoryPath: normalizedRepoPath,
        id: repo.id,
        createdAt:
          repo.createdAt instanceof Date ? repo.createdAt.getTime() : Number(repo.createdAt),
        gitInfoStatus,
        ...(gitInfo && {
          branch: gitInfo.branch,
          commitMessage: gitInfo.commitMessage,
          committer: gitInfo.committer,
          behindCount: gitInfo.behindCount,
        }),
      },
    });

    const repoFeatures = featuresByRepo[normalizedRepoPath] ?? [];
    appendFeatureNodes(
      repoFeatures,
      repoNodeId,
      featuresWithRuns,
      nodes,
      edges,
      repo.name,
      options
    );
  }

  // Second pass: group orphaned features under virtual repository nodes
  for (const [repoPath, orphanFeatures] of Object.entries(featuresByRepo)) {
    if (coveredPaths.has(repoPath)) continue;

    const virtualRepoNodeId = `virtual-repo-${repoPath}`;
    const repoName = repoPath.split('/').filter(Boolean).at(-1) ?? repoPath;
    nodes.push({
      id: virtualRepoNodeId,
      type: 'repositoryNode',
      position: { x: 0, y: 0 },
      data: { name: repoName, repositoryPath: repoPath },
    });

    appendFeatureNodes(
      orphanFeatures,
      virtualRepoNodeId,
      featuresWithRuns,
      nodes,
      edges,
      repoName,
      options
    );
  }

  // Add parent→child dependency edges
  for (const { feature } of featuresWithRuns) {
    if (feature.parentId) {
      const parentNodeId = `feat-${feature.parentId}`;
      const childNodeId = `feat-${feature.id}`;
      if (nodes.some((n) => n.id === parentNodeId) && nodes.some((n) => n.id === childNodeId)) {
        edges.push({
          id: `dep-${parentNodeId}-${childNodeId}`,
          source: parentNodeId,
          target: childNodeId,
          type: 'dependencyEdge',
        });
      }
    }
  }

  // Render application nodes — first-class peers of repository nodes on the
  // canvas. The caller passes every application; the client's `derive-graph`
  // wires app→feature dependency edges from each feature's `applicationId`.
  for (const app of options?.applications ?? []) {
    const data: ApplicationNodeData = {
      id: app.id,
      name: app.name,
      description: app.description,
      status: app.status,
      repositoryPath: normalizePath(app.repositoryPath),
      additionalPathCount: app.additionalPaths.length,
    };
    nodes.push({
      id: `app-${app.id}`,
      type: 'applicationNode',
      position: { x: 0, y: 0 },
      data,
    });
  }

  // Emit app-scoped feature nodes standalone. We deliberately do NOT push a
  // server-side edge here — `parseMaps` only uses `dependencyEdge` types to
  // recover parent/child relationships, and the client's `derive-graph`
  // builds the app→feature edge from `Feature.applicationId` so every render
  // is consistent regardless of how the feature arrived (initial SSR, SSE,
  // optimistic creation).
  appendFeatureNodes(appScopedFeatures, '', featuresWithRuns, nodes, edges, undefined, options);

  return { nodes, edges };
}

function appendFeatureNodes(
  repoFeatures: FeatureWithRun[],
  repoNodeId: string,
  allFeaturesWithRuns: FeatureWithRun[],
  nodes: CanvasNodeType[],
  edges: Edge[],
  repoName?: string,
  options?: BuildGraphNodesOptions
): void {
  // Sort by createdAt so newest features appear last (bottom) in the layout
  const sorted = [...repoFeatures].sort((a, b) => {
    const aTime =
      a.feature.createdAt instanceof Date
        ? a.feature.createdAt.getTime()
        : Number(a.feature.createdAt);
    const bTime =
      b.feature.createdAt instanceof Date
        ? b.feature.createdAt.getTime()
        : Number(b.feature.createdAt);
    return aTime - bTime;
  });

  sorted.forEach(({ feature, run }) => {
    // Resolve blockedBy display name from parent feature
    let blockedBy: string | undefined;
    if (feature.parentId && feature.lifecycle === 'Blocked') {
      const parentEntry = allFeaturesWithRuns.find((e) => e.feature.id === feature.parentId);
      if (parentEntry) {
        blockedBy = parentEntry.feature.name;
      }
    }

    // Detect crashed agents: DB says running/pending but PID is dead
    const isActive =
      run?.status === AgentRunStatus.running || run?.status === AgentRunStatus.pending;
    const pidAlive = isActive && run?.pid ? isProcessAlive(run.pid) : undefined;

    const nodeData: FeatureNodeData = {
      name: feature.name,
      description: feature.description ?? feature.slug,
      featureId: feature.id,
      lifecycle: deriveLifecycle(feature, run),
      repositoryPath: feature.repositoryPath,
      branch: feature.branch,
      worktreePath:
        feature.worktreePath ?? computeWorktreePath(feature.repositoryPath, feature.branch),
      specPath: feature.specPath,
      state: deriveNodeState(
        feature,
        run,
        pidAlive !== undefined ? { isPidAlive: pidAlive } : undefined
      ),
      progress: deriveProgress(feature),
      summary: feature.description,
      userQuery: feature.userQuery,
      createdAt:
        feature.createdAt instanceof Date ? feature.createdAt.getTime() : feature.createdAt,
      ...(feature.fast && { fastMode: true }),
      ...(feature.applicationId && { applicationId: feature.applicationId }),
      approvalGates: feature.approvalGates,
      push: feature.push,
      openPr: feature.openPr,
      forkAndPr: feature.forkAndPr,
      commitSpecs: feature.commitSpecs,
      enableEvidence: feature.enableEvidence ?? options?.enableEvidence ?? false,
      commitEvidence: feature.commitEvidence ?? options?.commitEvidence ?? false,
      ciWatchEnabled: feature.ciWatchEnabled ?? options?.ciWatchEnabled ?? true,
      ...(repoName && { repositoryName: repoName }),
      ...(run?.agentType && { agentType: run.agentType as FeatureNodeData['agentType'] }),
      ...(run?.modelId && { modelId: run.modelId }),
      ...(run?.error && { errorMessage: run.error }),
      ...(blockedBy && { blockedBy }),
      ...(feature.agentRunId != null && { hasAgentRun: true }),
      ...(feature.plan != null && { hasPlan: true }),
      ...(feature.pr && {
        pr: {
          url: feature.pr.url,
          number: feature.pr.number,
          status: feature.pr.status,
          ciStatus: feature.pr.ciStatus,
          commitHash: feature.pr.commitHash,
          mergeable: feature.pr.mergeable,
        },
      }),
    };

    const featureNodeId = `feat-${feature.id}`;
    nodes.push({
      id: featureNodeId,
      type: 'featureNode',
      position: { x: 0, y: 0 },
      data: nodeData,
    });

    // App-scoped features (called with an empty repoNodeId sentinel) get no
    // server-side edge — the client's `derive-graph` wires them to their
    // application from `Feature.applicationId`.
    if (!repoNodeId) {
      return;
    }

    // Child features connect via parent→child dependency edge, not directly to repo
    if (!feature.parentId) {
      edges.push({
        id: `edge-${repoNodeId}-${featureNodeId}`,
        source: repoNodeId,
        target: featureNodeId,
        style: { strokeDasharray: '5 5' },
      });
    }
  });
}
