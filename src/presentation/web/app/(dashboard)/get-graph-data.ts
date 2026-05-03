import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { IS_WINDOWS } from '@shepai/core/infrastructure/platform';
import { resolve } from '@/lib/server-container';
import type { ListFeaturesUseCase } from '@shepai/core/application/use-cases/features/list-features.use-case';
import type { ListRepositoriesUseCase } from '@shepai/core/application/use-cases/repositories/list-repositories.use-case';
import type {
  ListApplicationsUseCase,
  ApplicationWithStatus,
} from '@shepai/core/application/use-cases/applications/list-applications.use-case';
import type { AutoResolveMergedBranchesUseCase } from '@shepai/core/application/use-cases/features/auto-resolve-merged-branches.use-case';
import type { IAgentRunRepository } from '@shepai/core/application/ports/output/agents/agent-run-repository.interface';
import type { DeploymentStatusEntry } from '@shepai/core/application/ports/output/services/deployment-service.interface';
import type { ListDeploymentsUseCase } from '@shepai/core/application/use-cases/deployments/list-deployments.use-case';
import type { Repository } from '@shepai/core/domain/generated/output';
import { getSettings } from '@shepai/core/infrastructure/services/settings.service';
import { layoutWithDagre, getCanvasLayoutDefaults } from '@/lib/layout-with-dagre';
import { getLanguagePreference } from '@/lib/language';
import { buildGraphNodes } from '@/app/build-graph-nodes';
import type { CanvasNodeType } from '@/components/features/features-canvas';
import type { Edge } from '@xyflow/react';

const execFileAsync = promisify(execFileCb);

export interface RepoGitInfo {
  branch: string;
  commitMessage: string;
  committer: string;
  behindCount: number | null;
}

// Cache git info per repo — refreshed every GIT_INFO_TTL_MS via background-style check.
// getGraphData() always reads from cache (zero git calls), and only spawns git
// processes when the cache entry is older than the TTL.
const GIT_INFO_TTL_MS = 30_000;

type GitCacheEntry =
  | { kind: 'repo'; sha: string; data: RepoGitInfo; checkedAt: number }
  | { kind: 'not-a-repo'; checkedAt: number };

const gitInfoCache = new Map<string, GitCacheEntry>();

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

    // Fetch branch + subject & author in parallel
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

async function loadApplicationsSafely(): Promise<ApplicationWithStatus[]> {
  try {
    const useCase = resolve<ListApplicationsUseCase>('ListApplicationsUseCase');
    return await useCase.execute();
  } catch {
    // Use case not registered — skip silently (e.g. test environments)
    return [];
  }
}

export async function getGraphData(): Promise<{
  nodes: CanvasNodeType[];
  edges: Edge[];
  deployments: DeploymentStatusEntry[];
}> {
  const listFeatures = resolve<ListFeaturesUseCase>('ListFeaturesUseCase');
  const listRepos = resolve<ListRepositoriesUseCase>('ListRepositoriesUseCase');
  const agentRunRepo = resolve<IAgentRunRepository>('IAgentRunRepository');

  // Applications render on the Control Center canvas as first-class nodes
  // (peers of repository nodes) so a user who creates an app can immediately
  // continue working on it from the canvas — launching feature runs in
  // parallel, exactly like they would from a repo node. The dedicated
  // `/applications` page remains for app-specific deep navigation, but the
  // canvas is the primary surface for cross-entity workflows.
  //
  // Always include archived features so the client has full data for instant
  // show/hide toggle without a server round-trip (NFR-3).
  const [features, repositories, applications] = await Promise.all([
    listFeatures.execute({ includeArchived: true }),
    listRepos.execute(),
    loadApplicationsSafely(),
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

  // Fire-and-forget: resolve features whose branches have been merged.
  // This corrects stale "action needed" states without blocking page load.
  // Resolved features surface on the next SSE poll cycle (~500ms).
  try {
    const autoResolve = resolve<AutoResolveMergedBranchesUseCase>(
      'AutoResolveMergedBranchesUseCase'
    );
    void autoResolve.execute(features);
  } catch {
    // Use case not registered — skip silently (e.g. test environments)
  }

  // Batch-fetch all agent runs in one query instead of N findById calls
  // (the SSE poll uses the same shape — see StreamAgentEventsUseCase).
  const runIds = features
    .map((f) => f.agentRunId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const runs = runIds.length > 0 ? await agentRunRepo.findByIds(runIds) : [];
  const runById = new Map(runs.map((r) => [r.id, r]));
  const featuresWithRuns = features.map((feature) => ({
    feature,
    run: feature.agentRunId ? (runById.get(feature.agentRunId) ?? null) : null,
  }));

  const { workflow } = getSettings();
  const { nodes, edges } = buildGraphNodes(repositories, featuresWithRuns, {
    enableEvidence: workflow.enableEvidence,
    commitEvidence: workflow.commitEvidence,
    ciWatchEnabled: workflow.ciWatchEnabled,
    repoGitInfo: repoGitInfoMap,
    repoGitStatus: repoGitStatusMap,
    applications,
  });

  // Load all live deployments via the use case. The client-side
  // DeploymentStatusProvider hydrates from this list so node/drawer state
  // survives a page refresh and stays in sync across components.
  let deployments: DeploymentStatusEntry[] = [];
  try {
    const listDeployments = resolve<ListDeploymentsUseCase>('ListDeploymentsUseCase');
    deployments = await listDeployments.execute();
  } catch {
    // Use case not registered — leave deployments empty
  }

  const { dir } = getLanguagePreference();
  const laidOut = layoutWithDagre(nodes, edges, getCanvasLayoutDefaults(dir));
  return { ...laidOut, deployments };
}
