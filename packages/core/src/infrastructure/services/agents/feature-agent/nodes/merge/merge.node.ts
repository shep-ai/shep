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
  applyMemorySelection,
  type MemorySelector,
} from '../node-helpers.js';
import { reportNodeStart } from '../../heartbeat.js';
import {
  recordPhaseStart,
  recordPhaseEnd,
  recordApprovalWaitStart,
  updatePhasePrompt,
} from '../../phase-timing-context.js';
import { updateNodeLifecycle } from '../../lifecycle-context.js';
import { buildCommitPushPrPrompt, buildLocalSquashMergePrompt } from '../prompts/merge-prompts.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import { parseCommitHash, parsePrUrl } from './merge-output-parser.js';
import { runCiWatchFixLoop } from './ci-watch-fix-loop.js';
import { getSettings } from '@/infrastructure/services/settings.service.js';
import type { CleanupFeatureWorktreeUseCase } from '@/application/use-cases/features/cleanup-feature-worktree.use-case.js';
import type { IGitForkService } from '@/application/ports/output/services/git-fork-service.interface.js';

export interface MergeNodeDeps {
  executor: IAgentExecutor;
  /** Selects the relevant project-memory subset for the merge + CI-fix prompts. */
  selectMemory?: MemorySelector;
  getDiffSummary: (cwd: string, baseBranch: string) => Promise<DiffSummary>;
  hasRemote: (cwd: string) => Promise<boolean>;
  getDefaultBranch: (cwd: string) => Promise<string>;
  featureRepository: Pick<IFeatureRepository, 'findById' | 'update'>;
  /**
   * Perform a local squash merge (deterministic git commands, no agent needed).
   */
  localMergeSquash: (
    cwd: string,
    featureBranch: string,
    baseBranch: string,
    commitMessage: string,
    hasRemote?: boolean
  ) => Promise<void>;
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
  gitForkService?: IGitForkService;
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
    log.activate();
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
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    let totalNumTurns = 0;
    let totalDurationApiMs = 0;
    const { executor } = deps;
    const mergeTimingId = await recordPhaseStart('merge', {
      agentType: executor.agentType,
      modelId: state.model,
    });

    try {
      const cwd = state.worktreePath;

      const feature = await deps.featureRepository.findById(state.featureId);
      const branch = feature?.branch ?? `feat/${state.featureId}`;
      const baseBranch = await deps.getDefaultBranch(cwd);
      const options = buildExecutorOptions(state, undefined, 'merge');

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
        const mergePromptState = await applyMemorySelection(
          effectiveState,
          'merge',
          deps.selectMemory
        );
        const commitPushPrPrompt = buildCommitPushPrPrompt(
          mergePromptState,
          branch,
          baseBranch,
          repoUrl
        );
        await updatePhasePrompt(mergeTimingId, commitPushPrPrompt);
        const commitResult = await retryExecute(executor, commitPushPrPrompt, options, {
          logger: log,
        });
        totalInputTokens += commitResult.usage?.inputTokens ?? 0;
        totalOutputTokens += commitResult.usage?.outputTokens ?? 0;
        totalCostUsd += commitResult.usage?.costUsd ?? 0;
        totalNumTurns += commitResult.usage?.numTurns ?? 0;
        totalDurationApiMs += commitResult.usage?.durationApiMs ?? 0;

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

        // --- CI watch/fix loop (when push or openPr is enabled and CI watch is not disabled) ---
        const ciWatchEnabled = getSettings().workflow?.ciWatchEnabled !== false;
        if (ciWatchEnabled && (effectiveState.push || effectiveState.openPr)) {
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
              selectMemory: deps.selectMemory,
              repositoryPath: state.repositoryPath,
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
          await recordPhaseEnd(mergeTimingId, Date.now() - startTime, {
            inputTokens: totalInputTokens || undefined,
            outputTokens: totalOutputTokens || undefined,
            costUsd: totalCostUsd || undefined,
            numTurns: totalNumTurns || undefined,
            durationApiMs: totalDurationApiMs || undefined,
            exitCode: 'success',
          });
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

      // --- Fork-and-PR flow ---
      // When forkAndPr=true, fork the repo (or create a new repo as fallback),
      // push to the fork, create upstream PR, then transition to AwaitingUpstream.
      // If no upstream exists (created via fallback), skip PR and transition to Completed.
      if (state.forkAndPr && deps.gitForkService) {
        log.info('Fork-and-PR flow: forking repo and creating upstream PR');

        await deps.gitForkService.forkRepository(cwd);
        log.info('Repository forked/created, remotes configured');

        await deps.gitForkService.pushToFork(cwd, branch);
        log.info(`Branch ${branch} pushed to fork`);

        // Try to create upstream PR. This will fail gracefully if forkRepository
        // fell back to creating a new repo (no upstream remote to target).
        try {
          const upstreamPr = await deps.gitForkService.createUpstreamPr(
            cwd,
            feature?.name ?? branch,
            feature?.description ?? '',
            branch,
            baseBranch
          );
          log.info(`Upstream PR created: ${upstreamPr.url}`);
          messages.push(`[merge] Upstream PR created: ${upstreamPr.url}`);

          if (feature) {
            await deps.featureRepository.update({
              ...feature,
              lifecycle: SdlcLifecycle.AwaitingUpstream,
              pr: {
                ...(feature.pr ?? { url: '', number: 0, status: PrStatus.Open }),
                ...(commitHash ? { commitHash } : {}),
                upstreamPrUrl: upstreamPr.url,
                upstreamPrNumber: upstreamPr.number,
                upstreamPrStatus: PrStatus.Open,
              },
              updatedAt: new Date(),
            });
            messages.push(`[merge] Feature lifecycle → AwaitingUpstream`);
          }
        } catch {
          // No upstream remote — repo was created fresh, not forked.
          // Code is pushed to origin; transition to Maintain.
          log.info('No upstream remote — skipping upstream PR (repo created, not forked)');
          messages.push(`[merge] Code pushed to origin (no upstream to PR against)`);

          if (feature) {
            await deps.featureRepository.update({
              ...feature,
              lifecycle: SdlcLifecycle.Maintain,
              updatedAt: new Date(),
            });
            messages.push(`[merge] Feature lifecycle → Maintain`);
          }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        await recordPhaseEnd(mergeTimingId, Date.now() - startTime, {
          inputTokens: totalInputTokens || undefined,
          outputTokens: totalOutputTokens || undefined,
          exitCode: 'success',
        });
        messages.push(`[merge] Complete (${elapsed}s)`);
        log.info(`Fork-and-PR merge flow complete (${elapsed}s)`);

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
          // This will fail if the PR is not in a mergeable state (checks pending, reviews needed).
          log.info(`Merging PR #${prNumber} via GitHub API (squash)`);
          await deps.gitPrService.mergePr(cwd, prNumber, 'squash');
          messages.push(`[merge] PR #${prNumber} merged via squash`);
          merged = true;
        } else {
          // No PR: programmatic local squash merge in the ORIGINAL repo (not the worktree,
          // which IS the feature branch and must not be modified during merge).
          // Uses direct git commands instead of an agent for reliability.
          // On MERGE_CONFLICT, falls back to agent-based merge for conflict resolution.
          log.info('Programmatic local squash merge (no agent needed)');

          const commitMsg = `feat: squash merge ${branch} into ${baseBranch}`;
          try {
            await deps.localMergeSquash(
              state.repositoryPath,
              branch,
              baseBranch,
              commitMsg,
              remoteAvailable
            );

            log.info('Local squash merge completed successfully');
            messages.push(`[merge] Local squash merge completed`);
            merged = true;
          } catch (mergeErr: unknown) {
            // Fall back to agent-based merge when conflicts are detected.
            // The agent can resolve conflicts using its full coding capabilities.
            const isConflict =
              mergeErr instanceof GitPrError && mergeErr.code === GitPrErrorCode.MERGE_CONFLICT;

            if (!isConflict) throw mergeErr;

            const conflictDetails = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
            log.info(
              'Merge conflict detected — falling back to agent-based merge for conflict resolution'
            );
            messages.push(`[merge] Conflict detected, delegating to agent for resolution`);

            const mergePrompt = buildLocalSquashMergePrompt(
              state.repositoryPath,
              branch,
              baseBranch,
              commitMsg,
              conflictDetails
            );
            const mergeResult = await retryExecute(executor, mergePrompt, options, {
              logger: log,
            });
            totalInputTokens += mergeResult.usage?.inputTokens ?? 0;
            totalOutputTokens += mergeResult.usage?.outputTokens ?? 0;
            totalCostUsd += mergeResult.usage?.costUsd ?? 0;
            totalNumTurns += mergeResult.usage?.numTurns ?? 0;
            totalDurationApiMs += mergeResult.usage?.durationApiMs ?? 0;

            log.info('Agent-based merge completed successfully');
            messages.push(`[merge] Agent resolved conflicts and completed merge`);
            merged = true;
          }
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
      await recordPhaseEnd(mergeTimingId, Date.now() - startTime, {
        inputTokens: totalInputTokens || undefined,
        outputTokens: totalOutputTokens || undefined,
        exitCode: 'success',
      });
      messages.push(`[merge] Complete (${elapsed}s)`);
      log.info(`Merge flow complete (${elapsed}s)`);

      return {
        currentNode: 'merge',
        messages,
        commitHash,
        prUrl,
        prNumber,
        ciStatus,
        merged,
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
      await recordPhaseEnd(mergeTimingId, Date.now() - startTime, {
        inputTokens: totalInputTokens || undefined,
        outputTokens: totalOutputTokens || undefined,
        costUsd: totalCostUsd || undefined,
        numTurns: totalNumTurns || undefined,
        durationApiMs: totalDurationApiMs || undefined,
        exitCode: 'error',
        errorMessage: message.slice(0, 1000),
      });
      throw err;
    }
  };
}
