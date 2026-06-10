/**
 * CI Watch/Fix Loop
 *
 * After a push, watches CI status using an agent-based approach and attempts
 * automatic fixes when CI fails. The agent follows CI/CD best practices:
 * checks ALL runs, waits for ALL to complete, and reports accurate status.
 *
 * Respects configurable max attempts, timeout, and log size from settings.
 */

import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import { CiStatus, type CiFixRecord } from '@/domain/generated/output.js';
import type { NodeLogger, MemorySelector } from '../node-helpers.js';
import { retryExecute } from '../node-helpers.js';
import type { AgentExecutionOptions } from '@/application/ports/output/agents/agent-executor.interface.js';
import { buildCiWatchFixPrompt, buildCiWatchPrompt } from '../prompts/merge-prompts.js';
import { parseCiWatchResult } from './merge-output-parser.js';
import { extractRunId, handleCiTerminalFailure, buildCiExhaustedError } from './ci-helpers.js';
import { getSettings } from '@/infrastructure/services/settings.service.js';
import { recordPhaseStart, recordPhaseEnd } from '../../phase-timing-context.js';

export interface CiWatchFixDeps {
  executor: IAgentExecutor;
  gitPrService: IGitPrService;
  featureRepository: Pick<IFeatureRepository, 'findById' | 'update'>;
}

export interface CiWatchFixParams {
  cwd: string;
  branch: string;
  options: AgentExecutionOptions;
  feature: Awaited<ReturnType<Pick<IFeatureRepository, 'findById'>['findById']>>;
  prUrl: string | null;
  prNumber: number | null;
  existingAttempts: number;
  messages: string[];
  log: NodeLogger;
  /** Selects the relevant memory (ranked by the failure logs) for the CI-fix prompt. */
  selectMemory?: MemorySelector;
  /** Repository path used to scope memory selection. */
  repositoryPath: string;
}

export type CiFixStatusValue = 'idle' | 'watching' | 'fixing' | 'success' | 'exhausted' | 'timeout';

export interface CiWatchFixResult {
  ciStatus: CiStatus;
  ciFixAttempts: number;
  ciFixHistory: CiFixRecord[];
  ciFixStatus: CiFixStatusValue;
}

/**
 * Watch CI using an agent call. The agent checks ALL runs for the branch,
 * waits for ALL to complete, and reports structured CI_STATUS.
 *
 * Records a phase timing entry for the activity timeline.
 *
 * @returns Parsed CI status result with usage metrics
 */
async function watchCiViaAgent(
  executor: IAgentExecutor,
  branch: string,
  options: AgentExecutionOptions,
  timeoutMs: number,
  log: NodeLogger
): Promise<{
  status: 'success' | 'failure';
  summary?: string;
  runUrl?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    numTurns?: number;
    durationApiMs?: number;
  };
  timedOut?: boolean;
}> {
  const watchOptions = { ...options, timeout: timeoutMs };
  const watchPrompt = buildCiWatchPrompt(branch);
  const watchStart = Date.now();
  const timingId = await recordPhaseStart('merge:ci-watch', {
    agentType: executor.agentType,
    prompt: watchPrompt,
  });

  try {
    const result = await retryExecute(executor, watchPrompt, watchOptions, {
      maxAttempts: 1,
      logger: log,
    });

    const elapsed = Date.now() - watchStart;
    await recordPhaseEnd(timingId, elapsed, {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      costUsd: result.usage?.costUsd,
      numTurns: result.usage?.numTurns,
      durationApiMs: result.usage?.durationApiMs,
      exitCode: 'success',
    });

    const parsed = parseCiWatchResult(result.result);
    return { ...parsed, usage: result.usage };
  } catch (err) {
    const elapsed = Date.now() - watchStart;
    const errMsg = err instanceof Error ? err.message : String(err);
    await recordPhaseEnd(timingId, elapsed, {
      exitCode: 'error',
      errorMessage: errMsg.slice(0, 500),
    });

    // Check if this is a timeout
    if (errMsg.includes('timed out') || errMsg.includes('timeout')) {
      return { status: 'failure', summary: 'CI watch timed out', timedOut: true };
    }

    // For other errors, treat as indeterminate (failure)
    return { status: 'failure', summary: `CI watch agent error: ${errMsg.slice(0, 200)}` };
  }
}

/**
 * Run the CI watch/fix loop. Watches for the initial CI result using an
 * agent-based approach, then iteratively attempts fixes up to the configured maximum.
 *
 * Throws on timeout or exhausted attempts (after updating feature state).
 */
export async function runCiWatchFixLoop(
  deps: CiWatchFixDeps,
  params: CiWatchFixParams
): Promise<CiWatchFixResult> {
  const { executor, gitPrService } = deps;
  const { cwd, branch, options, feature, prUrl, prNumber, messages, log, selectMemory } = params;

  const settings = getSettings();
  const maxAttempts = settings.workflow?.ciMaxFixAttempts ?? 3;
  const timeoutMs = settings.workflow?.ciWatchTimeoutMs ?? 600_000;
  const logMaxChars = settings.workflow?.ciLogMaxChars ?? 50_000;

  let ciFixAttempts = params.existingAttempts;
  const ciFixHistory: CiFixRecord[] = [];
  let ciFixStatus: CiFixStatusValue;

  log.info(`Starting CI watch (maxAttempts=${maxAttempts}, timeout=${timeoutMs}ms)`);

  // Check if any CI run exists for this branch (lightweight check before spawning agent)
  let initialCiStatus;
  try {
    initialCiStatus = await gitPrService.getCiStatus(cwd, branch);
  } catch (err) {
    // Handle GitHub API rate limits gracefully — skip CI watching
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('rate limit') || errMsg.includes('403')) {
      log.info('GitHub API rate limit hit — skipping CI watch');
      return { ciStatus: CiStatus.Success, ciFixAttempts, ciFixHistory, ciFixStatus: 'idle' };
    }
    throw err;
  }
  if (!initialCiStatus.runUrl) {
    // No CI run detected — check if PR has merge conflicts which would prevent CI from running
    if (params.prNumber != null) {
      try {
        const mergeable = await gitPrService.getMergeableStatus(cwd, params.prNumber);
        if (mergeable === false) {
          log.info('No CI run detected — PR has merge conflicts');
          return {
            ciStatus: CiStatus.Failure,
            ciFixAttempts,
            ciFixHistory,
            ciFixStatus: 'idle',
          };
        }
      } catch {
        // getMergeableStatus failed — fall through to idle/success
      }
    }
    log.info('No CI run detected after push — skipping CI watch');
    return { ciStatus: CiStatus.Success, ciFixAttempts, ciFixHistory, ciFixStatus: 'idle' };
  }

  let runUrl = initialCiStatus.runUrl;

  // Initial CI watch via agent
  log.info('Watching CI via agent (checks ALL runs)');
  const watchResult = await watchCiViaAgent(executor, branch, options, timeoutMs, log);

  if (watchResult.runUrl) runUrl = watchResult.runUrl;

  if (watchResult.timedOut) {
    log.info('Initial CI watch timed out');
    ciFixHistory.push({
      attempt: ciFixAttempts + 1,
      startedAt: new Date().toISOString(),
      failureSummary: 'CI watch timed out',
      outcome: 'timeout',
    });
    await handleCiTerminalFailure(feature, prUrl, prNumber, deps.featureRepository, messages);
    throw buildCiExhaustedError(ciFixAttempts + 1, ciFixHistory, 'timeout');
  }

  if (watchResult.status === 'success') {
    log.info('CI passed on first watch');
    return { ciStatus: CiStatus.Success, ciFixAttempts, ciFixHistory, ciFixStatus: 'success' };
  }

  // CI failed — enter fix loop
  while (true) {
    // Fail-fast: check attempt count BEFORE invoking executor (NFR-3)
    if (ciFixAttempts >= maxAttempts) {
      log.info(`CI fix loop exhausted after ${ciFixAttempts} attempt(s)`);
      ciFixStatus = 'exhausted';
      break;
    }

    // Fetch failure logs for context
    const runId = extractRunId(runUrl) ?? '';
    const failureLogs = await gitPrService.getFailureLogs(cwd, runId, branch, logMaxChars);
    const startedAt = new Date().toISOString();

    log.info(`CI fix attempt ${ciFixAttempts + 1}/${maxAttempts} for run ${runId}`);

    // Record fix phase timing
    const fixStart = Date.now();
    const fixTimingId = await recordPhaseStart('merge:ci-fix', {
      agentType: executor.agentType,
    });

    // Select the memory most relevant to THIS failure (the logs are the query),
    // so past CI/build fixes that match the current error surface first.
    let ciFixMemory: string | undefined;
    if (selectMemory) {
      try {
        const { blob } = await selectMemory({
          repositoryPath: params.repositoryPath,
          phase: 'ci-fix',
          taskText: failureLogs,
        });
        ciFixMemory = blob.length > 0 ? blob : undefined;
      } catch {
        ciFixMemory = undefined;
      }
    }

    // Invoke fix executor — maxAttempts:1 prevents retryExecute's internal
    // retry logic from consuming CI fix attempts behind the outer loop's back.
    const fixPrompt = buildCiWatchFixPrompt(
      failureLogs,
      ciFixAttempts + 1,
      maxAttempts,
      branch,
      ciFixMemory
    );
    try {
      const fixResult = await retryExecute(executor, fixPrompt, options, {
        maxAttempts: 1,
        logger: log,
      });
      await recordPhaseEnd(fixTimingId, Date.now() - fixStart, {
        inputTokens: fixResult.usage?.inputTokens,
        outputTokens: fixResult.usage?.outputTokens,
        costUsd: fixResult.usage?.costUsd,
        numTurns: fixResult.usage?.numTurns,
        durationApiMs: fixResult.usage?.durationApiMs,
        exitCode: 'success',
      });
    } catch (execErr) {
      // If the fix executor fails, count it as a failed attempt and continue
      const execMsg = execErr instanceof Error ? execErr.message : String(execErr);
      await recordPhaseEnd(fixTimingId, Date.now() - fixStart, {
        exitCode: 'error',
        errorMessage: execMsg.slice(0, 500),
      });
      log.info(`CI fix executor failed on attempt ${ciFixAttempts + 1}: ${execMsg}`);
      ciFixAttempts++;
      ciFixHistory.push({
        attempt: ciFixAttempts,
        startedAt,
        failureSummary: `Executor error: ${execMsg.slice(0, 500)}`,
        outcome: 'failed',
      });
      messages.push(`[merge] CI fix attempt ${ciFixAttempts}/${maxAttempts} — executor failed`);
      continue;
    }
    ciFixAttempts++;

    // Watch CI after fix via agent (agent checks ALL runs for updated branch)
    log.info('Watching CI after fix via agent');
    const fixWatchResult = await watchCiViaAgent(executor, branch, options, timeoutMs, log);

    if (fixWatchResult.runUrl) runUrl = fixWatchResult.runUrl;

    if (fixWatchResult.timedOut) {
      log.info(`CI watch timed out during fix attempt ${ciFixAttempts}`);
      ciFixHistory.push({
        attempt: ciFixAttempts,
        startedAt,
        failureSummary: failureLogs.slice(0, 500),
        outcome: 'timeout',
      });
      ciFixStatus = 'timeout';
      break;
    }

    const outcome = fixWatchResult.status === 'success' ? 'fixed' : 'failed';
    ciFixHistory.push({
      attempt: ciFixAttempts,
      startedAt,
      failureSummary: failureLogs.slice(0, 500),
      outcome,
    });

    if (fixWatchResult.status === 'success') {
      log.info(`CI passed after fix attempt ${ciFixAttempts}`);
      ciFixStatus = 'success';
      return { ciStatus: CiStatus.Success, ciFixAttempts, ciFixHistory, ciFixStatus };
    }

    log.info(`CI still failing after fix attempt ${ciFixAttempts}`);
    messages.push(`[merge] CI fix attempt ${ciFixAttempts}/${maxAttempts} — still failing`);
  }

  // Handle terminal failure states
  await handleCiTerminalFailure(feature, prUrl, prNumber, deps.featureRepository, messages);
  throw buildCiExhaustedError(ciFixAttempts, ciFixHistory, ciFixStatus as 'exhausted' | 'timeout');
}
