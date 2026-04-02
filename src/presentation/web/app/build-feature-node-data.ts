import type { Feature, AgentRun } from '@shepai/core/domain/generated/output';
import { AgentRunStatus, FeatureMode } from '@shepai/core/domain/generated/output';
import {
  deriveNodeState,
  deriveProgress,
  deriveLifecycle,
} from '@/components/common/feature-node/derive-feature-state';
import { isProcessAlive } from '@shepai/core/infrastructure/services/process/is-process-alive';
import { computeWorktreePath } from '@shepai/core/infrastructure/services/ide-launchers/compute-worktree-path';
import type { FeatureNodeData } from '@/components/common/feature-node';

export interface BuildFeatureNodeDataOptions {
  baseBranch?: string;
  repositoryName?: string;
  /** AI-generated one-liner from FeatureArtifact */
  oneLiner?: string;
  /** Remote URL for the repository (HTTPS) */
  remoteUrl?: string;
  /** Whether evidence collection is enabled (global workflow setting) */
  enableEvidence?: boolean;
  /** Whether evidence is committed to the PR body (global workflow setting) */
  commitEvidence?: boolean;
  /** Whether CI watch/fix loop is enabled (global workflow setting) */
  ciWatchEnabled?: boolean;
  /** Whether to hide CI status badges from UI (global workflow setting) */
  hideCiStatus?: boolean;
}

/**
 * Builds a FeatureNodeData object from a Feature entity and optional AgentRun.
 * This is the single-feature version of the logic in `buildGraphNodes`.
 */
export function buildFeatureNodeData(
  feature: Feature,
  run: AgentRun | null,
  options?: BuildFeatureNodeDataOptions
): FeatureNodeData {
  // Detect crashed agents: DB says running/pending but PID is dead
  const isActive = run?.status === AgentRunStatus.running || run?.status === AgentRunStatus.pending;
  const pidAlive = isActive && run?.pid ? isProcessAlive(run.pid) : undefined;

  return {
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
    createdAt: feature.createdAt instanceof Date ? feature.createdAt.getTime() : feature.createdAt,
    ...(feature.mode === FeatureMode.Fast && { fastMode: true }),
    mode: feature.mode,
    ...(feature.iterationCount > 0 && { iterationCount: feature.iterationCount }),
    approvalGates: feature.approvalGates,
    push: feature.push,
    openPr: feature.openPr,
    forkAndPr: feature.forkAndPr,
    commitSpecs: feature.commitSpecs,
    enableEvidence: feature.enableEvidence ?? options?.enableEvidence ?? false,
    commitEvidence: feature.commitEvidence ?? options?.commitEvidence ?? false,
    ciWatchEnabled: feature.ciWatchEnabled ?? options?.ciWatchEnabled ?? true,
    ...(options?.hideCiStatus != null && { hideCiStatus: options.hideCiStatus }),
    ...(options?.repositoryName && { repositoryName: options.repositoryName }),
    ...(options?.baseBranch && { baseBranch: options.baseBranch }),
    ...(options?.oneLiner && { oneLiner: options.oneLiner }),
    ...(options?.remoteUrl && { remoteUrl: options.remoteUrl }),
    ...(run?.agentType && { agentType: run.agentType as FeatureNodeData['agentType'] }),
    ...(run?.modelId && { modelId: run.modelId }),
    ...(run?.error && { errorMessage: run.error }),
    ...(feature.agentRunId != null && { hasAgentRun: true }),
    ...(feature.plan != null && { hasPlan: true }),
    ...(feature.injectSkills && { injectSkills: true }),
    ...(feature.injectedSkills?.length && { injectedSkills: feature.injectedSkills }),
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
}
