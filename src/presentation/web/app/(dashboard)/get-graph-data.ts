import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { IS_WINDOWS } from '@shepai/core/infrastructure/platform';
import { resolve } from '@/lib/server-container';
import type { ListFeaturesUseCase } from '@shepai/core/application/use-cases/features/list-features.use-case';
import type { ListRepositoriesUseCase } from '@shepai/core/application/use-cases/repositories/list-repositories.use-case';
import type { IAgentRunRepository } from '@shepai/core/application/ports/output/agents/agent-run-repository.interface';
import type { IDeploymentService } from '@shepai/core/application/ports/output/services/deployment-service.interface';
import type { Repository } from '@shepai/core/domain/generated/output';
import { getSettings } from '@shepai/core/infrastructure/services/settings.service';
import { layoutWithDagre, CANVAS_LAYOUT_DEFAULTS } from '@/lib/layout-with-dagre';
import { buildGraphNodes } from '@/app/build-graph-nodes';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { FeatureNodeData } from '@/components/common/feature-node';
import type { Edge } from '@xyflow/react';

const execFileAsync = promisify(execFileCb);

export interface RepoGitInfo {
  branch: string;
  commitMessage: string;
  committer: string;
  behindCount: number | null;
  hasRemote: boolean;
}

// Cache git info per repo — refreshed every GIT_INFO_TTL_MS via background-style check.
// getGraphData() always reads from cache (zero git calls), and only spawns git
// processes when the cache entry is older than the TTL.
const GIT_INFO_TTL_MS = 30_000;

type GitCacheEntry =
  | { kind: 'repo'; sha: string; data: RepoGitInfo; checkedAt: number }
  | { kind: 'not-a-repo'; checkedAt: number };

const gitInfoCache = new Map<string, GitCacheEntry>();

/** Evict a repo from the git info cache so the next getGraphData() call fetches fresh data. */
export function invalidateRepoGitCache(repoPath: string): void {
  gitInfoCache.delete(repoPath);
}

async function gitCommand(cwd: string, args: string[]): Promise<string | null> {
  try {
    const opts = IS_WINDOWS ? { cwd, windowsHide: true } : { cwd };
    const { stdout } = await execFileAsync('git', args, opts);
    return stdout.trim();
  } catch {
    return null;
  }
}

const FIELD_SEP = '\x1f'; // ASCII Unit Separator — safe in git output and child_process

/** Refresh git info for a single repo (spawns git processes). */
async function refreshRepoGitInfo(repo: Repository): Promise<void> {
  try {
    const headSha = await gitCommand(repo.path, ['rev-parse', 'HEAD']);
    if (!headSha) {
      // Not a git repo (or bare/broken) — cache this so the UI can show it
      gitInfoCache.set(repo.path, { kind: 'not-a-repo', checkedAt: Date.now() });
      return;
    }

    // Always check hasRemote — adding a remote does NOT change HEAD
    const remoteUrl = await gitCommand(repo.path, ['remote', 'get-url', 'origin']);
    const hasRemote = remoteUrl !== null && remoteUrl.length > 0;

    const cached = gitInfoCache.get(repo.path);
    if (cached?.kind === 'repo' && cached.sha === headSha) {
      // HEAD unchanged — just bump checkedAt
      cached.checkedAt = Date.now();
      cached.data.hasRemote = hasRemote;
      return;
    }

    // HEAD changed — fetch branch + subject & author in parallel
    const [currentBranch, logLine] = await Promise.all([
      gitCommand(repo.path, ['symbolic-ref', '--short', 'HEAD']),
      gitCommand(repo.path, ['log', '-1', `--format=%s${FIELD_SEP}%an`]),
    ]);
    if (!currentBranch) return;

    const [commitMessage, committer] = (logLine ?? '').split(FIELD_SEP);

    // Behind count — always compute, even when on the default branch,
    // because local main can be behind origin/main.
    let behindCount: number | null = null;
    const defaultBranchRef = await gitCommand(repo.path, [
      'symbolic-ref',
      '--short',
      'refs/remotes/origin/HEAD',
    ]);
    const defaultBranch = defaultBranchRef?.replace('origin/', '') ?? null;

    if (defaultBranch) {
      // Compare current branch (or default branch itself) against origin
      const behind = await gitCommand(repo.path, [
        'rev-list',
        '--count',
        `${currentBranch}..origin/${defaultBranch}`,
      ]);
      behindCount = behind !== null ? parseInt(behind, 10) : null;
      if (isNaN(behindCount!)) behindCount = null;
    }

    gitInfoCache.set(repo.path, {
      kind: 'repo',
      sha: headSha,
      checkedAt: Date.now(),
      data: {
        branch: currentBranch,
        commitMessage: commitMessage ?? 'unknown',
        committer: committer ?? 'unknown',
        behindCount,
        hasRemote,
      },
    });
  } catch {
    // ignore — stale cache is better than no data
  }
}

export type GitInfoResult =
  | { status: 'loading' }
  | { status: 'ready'; data: RepoGitInfo }
  | { status: 'not-a-repo' };

/**
 * Return cached git info for a repo. If the cache is stale (> TTL),
 * kick off a fire-and-forget refresh so the NEXT call gets fresh data.
 * Never blocks getGraphData() with git subprocess calls.
 */
function getRepoGitInfo(repo: Repository): GitInfoResult {
  const cached = gitInfoCache.get(repo.path);
  const now = Date.now();

  if (!cached) {
    // First time — trigger async refresh, return loading for this call
    void refreshRepoGitInfo(repo);
    return { status: 'loading' };
  }

  if (now - cached.checkedAt >= GIT_INFO_TTL_MS) {
    // Stale — trigger async refresh, return current data immediately
    void refreshRepoGitInfo(repo);
  }

  if (cached.kind === 'not-a-repo') {
    return { status: 'not-a-repo' };
  }

  return { status: 'ready', data: cached.data };
}

export async function getGraphData(): Promise<{ nodes: CanvasNodeType[]; edges: Edge[] }> {
  const listFeatures = resolve<ListFeaturesUseCase>('ListFeaturesUseCase');
  const listRepos = resolve<ListRepositoriesUseCase>('ListRepositoriesUseCase');
  const agentRunRepo = resolve<IAgentRunRepository>('IAgentRunRepository');

  // Always include archived features so the client has full data for instant
  // show/hide toggle without a server round-trip (NFR-3).
  const [features, repositories] = await Promise.all([
    listFeatures.execute({ includeArchived: true }),
    listRepos.execute(),
  ]);

  // Read git info from cache (zero git calls). Stale entries trigger
  // a fire-and-forget background refresh for the next poll cycle.
  const repoGitInfoMap = new Map<string, RepoGitInfo>();
  const repoGitStatusMap = new Map<string, 'loading' | 'ready' | 'not-a-repo'>();
  for (const repo of repositories) {
    const result = getRepoGitInfo(repo);
    repoGitStatusMap.set(repo.path, result.status);
    if (result.status === 'ready') {
      repoGitInfoMap.set(repo.path, result.data);
    }
  }

  // PR/CI status is kept fresh by PrSyncWatcher (30s background poll).
  // No live GitHub calls here — use cached DB values for fast response.

  const featuresWithRuns = await Promise.all(
    features.map(async (feature) => {
      const run = feature.agentRunId ? await agentRunRepo.findById(feature.agentRunId) : null;
      return { feature, run };
    })
  );

  const { workflow } = getSettings();
  const { nodes, edges } = buildGraphNodes(repositories, featuresWithRuns, {
    enableEvidence: workflow.enableEvidence,
    commitEvidence: workflow.commitEvidence,
    ciWatchEnabled: workflow.ciWatchEnabled,
    repoGitInfo: repoGitInfoMap,
    repoGitStatus: repoGitStatusMap,
  });

  // Enrich feature nodes with deployment status
  let deploymentService: IDeploymentService | null = null;
  try {
    deploymentService = resolve<IDeploymentService>('IDeploymentService');
  } catch {
    // Deployment service may not be registered — skip enrichment
  }

  if (deploymentService) {
    for (const node of nodes) {
      if (node.type !== 'featureNode') continue;
      const data = node.data as FeatureNodeData;
      const status = deploymentService.getStatus(data.featureId);
      if (status && status.state !== 'Stopped') {
        data.deployment = {
          status: status.state,
          ...(status.url && { url: status.url }),
        };
      }
    }
  }

  return layoutWithDagre(nodes, edges, CANVAS_LAYOUT_DEFAULTS);
}
