/**
 * Merge Node — Agent-Driven Post-Implementation Merge Flow
 *
 * Handles the complete merge workflow after implementation using two agent calls:
 * 1. Commit + push + create PR (via agent executor)
 * 2. Merge/squash (via agent executor, after approval gate)
 *
 * Uses interrupt() for the merge approval gate when allowMerge=false.
 *
 * Sub-modules:
 * - ci-watch-fix-loop.ts: CI watch + automatic fix loop
 * - ci-helpers.ts: shared CI utility functions
 * - merge-output-parser.ts: structured data extraction from agent output
 */

import { interrupt, isGraphBubbleUp } from '@langchain/langgraph';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { FeatureAgentState } from '../../state.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type {
  DiffSummary,
  IGitPrService,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import { SdlcLifecycle, PrStatus, type CiStatus } from '@/domain/generated/output.js';
import {
  createNodeLogger,
  shouldInterrupt,
  retryExecute,
  buildExecutorOptions,
} from '../node-helpers.js';
import { reportNodeStart } from '../../heartbeat.js';
import {
  recordPhaseStart,
  recordPhaseEnd,
  recordApprovalWaitStart,
} from '../../phase-timing-context.js';
import { updateNodeLifecycle } from '../../lifecycle-context.js';
import { buildCommitPushPrPrompt, buildMergeSquashPrompt } from '../prompts/merge-prompts.js';
import { parseCommitHash, parsePrUrl } from './merge-output-parser.js';
import { runCiWatchFixLoop } from './ci-watch-fix-loop.js';
import type { CleanupFeatureWorktreeUseCase } from '@/application/use-cases/features/cleanup-feature-worktree.use-case.js';

export interface MergeNodeDeps {
  executor: IAgentExecutor;
  getDiffSummary: (cwd: string, baseBranch: string) => Promise<DiffSummary>;
  hasRemote: (cwd: string) => Promise<boolean>;
  getDefaultBranch: (cwd: string) => Promise<string>;
  featureRepository: Pick<IFeatureRepository, 'findById' | 'update'>;
  /**
   * Verify that featureBranch has been merged into baseBranch.
   * Returns true if baseBranch contains all commits from featureBranch.
   */
  verifyMerge: (
    cwd: string,
    featureBranch: string,
    baseBranch: string,
    premergeBaseSha?: string
  ) => Promise<boolean>;
  /**
   * Resolve a branch ref to its current SHA.
   */
  revParse: (cwd: string, ref: string) => Promise<string>;
  gitPrService: IGitPrService;
  cleanupFeatureWorktreeUseCase: Pick<CleanupFeatureWorktreeUseCase, 'execute'>;
}

/**
 * Factory that creates the merge node function.
 *
 * @param deps - External dependencies injected by the graph factory
 * @returns A LangGraph node function
 */
export function createMergeNode(deps: MergeNodeDeps) {
  const log = createNodeLogger('merge');

  return async (state: FeatureAgentState): Promise<Partial<FeatureAgentState>> => {
    log.info('Starting merge flow');
    reportNodeStart('merge');
    await updateNodeLifecycle('merge');

    // --- Rejection detection on resume ---
    // Use DB lifecycle (Review) instead of feature.yaml completedPhases to detect
    // resume, because feature.yaml is in the worktree which was already pushed.
    // Also require _approvalAction to be set — this distinguishes a genuine resume
    // (where the worker sets _approvalAction via Command({update})) from a first run
    // where updateNodeLifecycle('merge') already set lifecycle=Review in the DB.
    const featureForResume = await deps.featureRepository.findById(state.featureId);
    const isResumeAfterInterrupt =
      featureForResume?.lifecycle === SdlcLifecycle.Review &&
      shouldInterrupt('merge', state.approvalGates) &&
      state._approvalAction !== null;

    if (isResumeAfterInterrupt && state._approvalAction === 'rejected') {
      const feedback = state._rejectionFeedback ?? '(no feedback)';
      log.info(`Merge rejected with feedback: "${feedback}" — scheduling re-execution`);
      // Reset lifecycle so re-execution doesn't detect as resume
      if (featureForResume) {
        await deps.featureRepository.update({
          ...featureForResume,
          lifecycle: SdlcLifecycle.Implementation,
          pr: undefined,
          updatedAt: new Date(),
        });
      }
      return {
        currentNode: 'merge',
        messages: [`[merge] Rejected — will re-execute`],
        error: null,
        _approvalAction: null,
        _rejectionFeedback: null,
        _needsReexecution: true,
      };
    }

    const messages: string[] = [];
    const startTime = Date.now();
    const mergeTimingId = await recordPhaseStart('merge');

    try {
      const { executor } = deps;
      const cwd = state.worktreePath;

      const feature = await deps.featureRepository.findById(state.featureId);
      const branch = feature?.branch ?? `feat/${state.featureId}`;
      const baseBranch = await deps.getDefaultBranch(cwd);
      const options = buildExecutorOptions(state);

      let commitHash = state.commitHash;
      let prUrl = state.prUrl;
      let prNumber = state.prNumber;
      let ciStatus = state.ciStatus;

      let ciFixAttempts = state.ciFixAttempts ?? 0;
      let ciFixHistory = state.ciFixHistory ?? [];
      let ciFixStatus = state.ciFixStatus ?? 'idle';

      // --- Check for git remote (needed by both agent calls) ---
      const remoteAvailable = await deps.hasRemote(cwd);
      const repoUrl = remoteAvailable
        ? ((await deps.gitPrService.getRemoteUrl(cwd)) ?? undefined)
        : undefined;

      // --- Agent Call 1: Commit + Push + PR (skip on approval resume) ---
      if (!isResumeAfterInterrupt) {
        if (!remoteAvailable) {
          log.info('No git remote configured — skipping push and PR, will merge locally');
        }

        const effectiveState = remoteAvailable ? state : { ...state, push: false, openPr: false };

        log.info('Agent call 1: commit + push + PR');
        const commitPushPrPrompt = buildCommitPushPrPrompt(
          effectiveState,
          branch,
          baseBranch,
          repoUrl
        );
        const commitResult = await retryExecute(executor, commitPushPrPrompt, options, {
          logger: log,
        });

        commitHash = parseCommitHash(commitResult.result) ?? state.commitHash;
        messages.push(`[merge] Agent completed commit/push/PR operations`);

        if (effectiveState.openPr) {
          const prResult = parsePrUrl(commitResult.result);
          if (prResult) {
            prUrl = prResult.url;
            prNumber = prResult.number;

            // Cross-validate agent-parsed PR URL against authoritative source.
            // The agent may hallucinate the repo URL or PR number, so we look up
            // the real PR for this branch via the GitHub API.
            try {
              const prStatuses = await deps.gitPrService.listPrStatuses(cwd);
              const matchingPr = prStatuses.find((pr) => pr.headRefName === branch);
              if (matchingPr) {
                prUrl = matchingPr.url;
                prNumber = matchingPr.number;
              }
            } catch {
              // gh CLI unavailable or API failure — fall back to agent-parsed URL
            }

            messages.push(`[merge] PR created: ${prUrl}`);
          }
        }

        // --- CI watch/fix loop (when push or openPr is enabled) ---
        if (effectiveState.push || effectiveState.openPr) {
          const ciResult = await runCiWatchFixLoop(
            {
              executor,
              gitPrService: deps.gitPrService,
              featureRepository: deps.featureRepository,
            },
            {
              cwd,
              branch,
              options,
              feature,
              prUrl,
              prNumber,
              existingAttempts: ciFixAttempts,
              messages,
              log,
            }
          );
          ciStatus = ciResult.ciStatus;
          ciFixAttempts = ciResult.ciFixAttempts;
          ciFixHistory = ciResult.ciFixHistory;
          ciFixStatus = ciResult.ciFixStatus;
        }

        // --- Persist lifecycle + PR data before approval gate ---
        // Setting lifecycle to Review serves as the resume detection marker
        // (replaces feature.yaml completedPhases which dirtied the worktree).
        if (feature) {
          await deps.featureRepository.update({
            ...feature,
            lifecycle: SdlcLifecycle.Review,
            ...(prUrl && prNumber
              ? {
                  pr: {
                    url: prUrl,
                    number: prNumber,
                    status: PrStatus.Open,
                    ...(commitHash ? { commitHash } : {}),
                    ...(ciStatus ? { ciStatus: ciStatus as CiStatus } : {}),
                    ...(ciFixAttempts > 0 ? { ciFixAttempts } : {}),
                    ...(ciFixHistory.length > 0 ? { ciFixHistory } : {}),
                  },
                }
              : {}),
            updatedAt: new Date(),
          });
          log.info('Persisted lifecycle=Review and PR data to feature record');
        }

        // --- Merge approval gate ---
        if (shouldInterrupt('merge', state.approvalGates)) {
          log.info('Interrupting for merge approval');
          await recordPhaseEnd(mergeTimingId, Date.now() - startTime);
          await recordApprovalWaitStart(mergeTimingId);
          const diffSummary = await deps.getDiffSummary(cwd, baseBranch);
          interrupt({
            node: 'merge',
            message: 'Merge approval required. Review the changes and approve to continue.',
            diffSummary,
            prUrl,
            prNumber,
            ciStatus,
            evidence: state.evidence ?? [],
          });
        }
      } else {
        log.info('Merge approved — skipping commit/push/PR, continuing to post-merge');
        messages.push(`[merge] Approved — continuing`);

        // Restore PR data from feature record (persisted before interrupt, but
        // not returned in graph state because interrupt() threw before the return).
        if (feature?.pr) {
          prUrl = feature.pr.url ?? prUrl;
          prNumber = feature.pr.number ?? prNumber;
          commitHash = feature.pr.commitHash ?? commitHash;
          ciStatus = (feature.pr.ciStatus as string) ?? ciStatus;
        }
      }

      // --- Merge ---
      // Merge when: allowMerge is true (auto-merge), OR user explicitly
      // approved at the merge gate (isResumeAfterInterrupt means they
      // clicked Approve). The approval IS permission to merge.
      let merged = false;
      const userApprovedMerge = isResumeAfterInterrupt && state._approvalAction !== 'rejected';
      if (state.approvalGates?.allowMerge || userApprovedMerge) {
        if (prUrl && prNumber) {
          // PR exists: merge via GitHub API directly — no agent or local merge needed.
          log.info(`Merging PR #${prNumber} via GitHub API (squash)`);
          await deps.gitPrService.mergePr(cwd, prNumber, 'squash');
          messages.push(`[merge] PR #${prNumber} merged via squash`);
          merged = true;
        } else {
          // No PR: local merge via agent in the ORIGINAL repo (not the worktree,
          // which IS the feature branch and must not be modified during merge).
          log.info('Agent call: merge/squash (local, no PR)');

          // Record base branch HEAD before merge so verification can detect
          // agents that modify the tree during squash (e.g. adding .gitignore).
          const premergeBaseSha = await deps.revParse(state.repositoryPath, baseBranch);

          const mergePrompt = buildMergeSquashPrompt(
            { ...state, prUrl, prNumber, commitHash },
            branch,
            baseBranch,
            remoteAvailable
          );
          const mergeOptions = { ...options, cwd: state.repositoryPath };
          await retryExecute(executor, mergePrompt, mergeOptions, { logger: log });

          // Verify the merge actually succeeded (agent may report success without merging)
          const mergeVerified = await deps.verifyMerge(
            state.repositoryPath,
            branch,
            baseBranch,
            premergeBaseSha
          );
          if (!mergeVerified) {
            throw new Error(
              `Merge verification failed: ${branch} was not merged into ${baseBranch}. ` +
                `The agent may have encountered errors during the merge operation.`
            );
          }
          log.info('Merge verified: feature branch is ancestor of base branch');
          messages.push(`[merge] Agent completed local merge operation`);
          merged = true;
        }
      }

      // --- Update feature lifecycle ---
      const newLifecycle = merged ? SdlcLifecycle.Maintain : SdlcLifecycle.Review;
      if (feature) {
        await deps.featureRepository.update({
          ...feature,
          lifecycle: newLifecycle,
          ...(prUrl && prNumber
            ? {
                pr: {
                  url: prUrl,
                  number: prNumber,
                  status: merged ? PrStatus.Merged : PrStatus.Open,
                  ...(commitHash ? { commitHash } : {}),
                  ...(ciStatus ? { ciStatus: ciStatus as CiStatus } : {}),
                  ...(ciFixAttempts > 0 ? { ciFixAttempts } : {}),
                  ...(ciFixHistory.length > 0 ? { ciFixHistory } : {}),
                },
              }
            : {}),
          updatedAt: new Date(),
        });
        messages.push(`[merge] Feature lifecycle → ${newLifecycle}`);

        if (merged) {
          await deps.cleanupFeatureWorktreeUseCase.execute(feature.id);
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      await recordPhaseEnd(mergeTimingId, Date.now() - startTime);
      messages.push(`[merge] Complete (${elapsed}s)`);
      log.info(`Merge flow complete (${elapsed}s)`);

      return {
        currentNode: 'merge',
        messages,
        commitHash,
        prUrl,
        prNumber,
        ciStatus,
        ciFixAttempts,
        ciFixHistory,
        ciFixStatus,
        _approvalAction: null,
        _rejectionFeedback: null,
        _needsReexecution: false,
      };
    } catch (err: unknown) {
      if (isGraphBubbleUp(err)) throw err;

      const message = err instanceof Error ? err.message : String(err);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log.error(`Merge failed: ${message} (${elapsed}s)`);
      await recordPhaseEnd(mergeTimingId, Date.now() - startTime);
      throw err;
    }
  };
}
