/**
 * Evidence Node — Agent-Directed Evidence Collection
 *
 * Captures visual and textual evidence (screenshots, test outputs,
 * terminal recordings) proving that implemented tasks work as expected.
 * Evidence files are committed to .shep/evidence/ on the feature branch
 * and evidence records flow through graph state to the merge node for
 * inclusion in the PR body.
 *
 * Uses a custom node pattern (not executeNode) because it needs a
 * post-execution parsing step to extract Evidence[] from the agent's
 * text output via parseEvidenceRecords. Reuses the same helpers as
 * other nodes (createNodeLogger, buildExecutorOptions, retryExecute,
 * getCompletedPhases, markPhaseComplete).
 *
 * Includes a validation loop that inspects Evidence[] for quality and
 * completeness after each collection attempt. If validation fails, the
 * agent is retried with structured feedback about what's missing. After
 * exhausting retries, the system proceeds with partial evidence (FR-8
 * graceful degradation). Each attempt is recorded as a separate phase
 * activity (evidence:attempt-N) for timing visibility.
 */

import yaml from 'js-yaml';
import { isGraphBubbleUp } from '@langchain/langgraph';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { Evidence } from '@/domain/generated/output.js';
import type { FeatureAgentState } from '../state.js';
import {
  createNodeLogger,
  getCompletedPhases,
  markPhaseComplete,
  readSpecFile,
  retryExecute,
  buildExecutorOptions,
  saveEvidenceManifest,
} from './node-helpers.js';
import { reportNodeStart } from '../heartbeat.js';
import { recordPhaseStart, recordPhaseEnd } from '../phase-timing-context.js';
import { updateNodeLifecycle } from '../lifecycle-context.js';
import { buildEvidencePrompt, buildEvidenceRetryPrompt } from './prompts/evidence-prompts.js';
import {
  parseEvidenceRecords,
  validateUiEvidenceHasAppProof,
  validateEvidence,
  type TaskForValidation,
  type ValidationError,
} from './evidence-output-parser.js';
import { hasSettings, getSettings } from '../../../settings.service.js';

const DEFAULT_MAX_RETRIES = 3;

/**
 * Parse tasks.yaml into TaskForValidation[] for evidence completeness checking.
 * Returns empty array if tasks.yaml is missing or unparseable.
 */
function parseTasks(specDir: string): TaskForValidation[] {
  const content = readSpecFile(specDir, 'tasks.yaml');
  if (!content) return [];

  try {
    const data = yaml.load(content) as { tasks?: unknown[] };
    if (!data?.tasks || !Array.isArray(data.tasks)) return [];

    return data.tasks
      .filter((t): t is Record<string, unknown> => t !== null && typeof t === 'object')
      .map((t) => ({
        id: String(t.id ?? ''),
        title: String(t.title ?? ''),
        description: String(t.description ?? ''),
        acceptanceCriteria: Array.isArray(t.acceptanceCriteria)
          ? t.acceptanceCriteria.map(String)
          : [],
        tdd: t.tdd != null ? (t.tdd as TaskForValidation['tdd']) : null,
      }));
  } catch {
    return [];
  }
}

/**
 * Factory that creates the evidence collection node function.
 *
 * @param executor - Agent executor for running the evidence capture prompt
 * @returns A LangGraph node function
 */
export function createEvidenceNode(executor: IAgentExecutor) {
  const log = createNodeLogger('evidence');

  return async (state: FeatureAgentState): Promise<Partial<FeatureAgentState>> => {
    log.activate();
    log.info('Starting evidence collection');
    reportNodeStart('evidence');
    await updateNodeLifecycle('evidence');

    // --- Resume support: skip if already completed ---
    const completedPhases = getCompletedPhases(state.specDir);
    if (completedPhases.includes('evidence')) {
      log.info('Evidence phase already completed, skipping execution');
      return {
        currentNode: 'evidence',
        messages: ['[evidence] Already completed — skipping'],
        _needsReexecution: false,
      };
    }

    // --- Configuration ---
    // Use feature-level state for commitEvidence; fall back to global for retries config
    const commitEvidence = state.commitEvidence;
    const settings = hasSettings() ? getSettings() : undefined;
    const maxRetries = settings?.workflow.evidenceRetries ?? DEFAULT_MAX_RETRIES;
    const options = buildExecutorOptions(state, undefined, 'evidence');
    const tasks = parseTasks(state.specDir);

    // --- Validation retry loop ---
    let allEvidence: Evidence[] = [];
    const allMessages: string[] = [];
    let attempt = 0;
    let lastErrors: ValidationError[] = [];

    while (attempt < maxRetries) {
      attempt++;
      const attemptStart = Date.now();

      // Build prompt: base for first attempt, retry with feedback for subsequent
      const prompt =
        attempt === 1
          ? buildEvidencePrompt(state, { commitEvidence })
          : buildEvidenceRetryPrompt(state, lastErrors, { commitEvidence });

      const timingId = await recordPhaseStart(`evidence:attempt-${attempt}`, {
        prompt,
        modelId: state.model,
        agentType: executor.agentType,
      });

      try {
        log.info(`Attempt ${attempt}/${maxRetries}: executing agent at cwd=${options.cwd}`);
        const result = await retryExecute(executor, prompt, options, { logger: log });
        const durationMs = Date.now() - attemptStart;
        const elapsed = (durationMs / 1000).toFixed(1);
        log.info(`Attempt ${attempt}: agent complete (${result.result.length} chars, ${elapsed}s)`);

        // --- Parse evidence records (graceful degradation) ---
        let evidence: Evidence[];
        try {
          evidence = parseEvidenceRecords(result.result);
          log.info(`Attempt ${attempt}: parsed ${evidence.length} evidence record(s)`);
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          log.error(
            `Attempt ${attempt}: evidence parsing failed: ${msg} — continuing with empty evidence`
          );
          evidence = [];
        }

        // Accumulate evidence from all attempts (FR-11), deduplicating by
        // type + relativePath so retries that recapture the same files don't
        // produce duplicate entries in the manifest.
        const merged = new Map<string, Evidence>();
        for (const e of [...allEvidence, ...evidence]) {
          merged.set(`${e.type}:${e.relativePath}`, e);
        }
        allEvidence = [...merged.values()];

        // --- Validate UI evidence (informational warnings) ---
        const uiResult = validateUiEvidenceHasAppProof(evidence);
        if (uiResult.warnings.length > 0) {
          for (const warning of uiResult.warnings) {
            log.error(`Evidence validation: ${warning}`);
            allMessages.push(`[evidence] Warning: ${warning}`);
          }
        }

        // --- Validate evidence completeness + file existence ---
        // Resolve repo-relative evidence paths against the SAME directory the
        // agent ran in — the daemon's process.cwd() is an unrelated directory.
        const validationResult = await validateEvidence(allEvidence, tasks, options.cwd);
        await recordPhaseEnd(timingId, Date.now() - attemptStart, {
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
          cacheCreationInputTokens: result.usage?.cacheCreationInputTokens,
          cacheReadInputTokens: result.usage?.cacheReadInputTokens,
          costUsd: result.usage?.costUsd,
          numTurns: result.usage?.numTurns,
          durationApiMs: result.usage?.durationApiMs,
          exitCode: validationResult.valid ? 'success' : 'error',
        });

        if (validationResult.valid) {
          log.info(`Attempt ${attempt}: validation passed`);
          break;
        }

        // Validation failed
        lastErrors = validationResult.errors;
        const errorSummary = validationResult.errors.map((e) => e.message).join('; ');

        if (attempt < maxRetries) {
          log.error(
            `Attempt ${attempt}: validation failed (${validationResult.errors.length} errors), retrying — ${errorSummary}`
          );
        } else {
          // Exhausted retries — graceful degradation (FR-8)
          log.error(
            `Attempt ${attempt}: validation failed after ${maxRetries} attempts — proceeding with partial evidence`
          );
          allMessages.push(
            `[evidence] Warning: Validation failed after ${maxRetries} retries: ${errorSummary}`
          );
        }
      } catch (err: unknown) {
        const durationMs = Date.now() - attemptStart;
        await recordPhaseEnd(timingId, durationMs, {
          exitCode: 'error',
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
        });

        // Re-throw LangGraph control-flow exceptions
        if (isGraphBubbleUp(err)) throw err;

        // Non-retryable executor error — propagate immediately
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Attempt ${attempt}: evidence collection failed: ${message}`);
        throw new Error(`[evidence] ${message}`);
      }
    }

    saveEvidenceManifest(state, allEvidence, log);
    markPhaseComplete(state.specDir, 'evidence', log);

    allMessages.unshift(
      `[evidence] Complete — ${allEvidence.length} evidence record(s) captured in ${attempt} attempt(s)`,
      ...(allEvidence.length === 0
        ? ['[evidence] Warning: no evidence records parsed from agent output']
        : [])
    );

    return {
      currentNode: 'evidence',
      evidence: allEvidence,
      evidenceRetries: attempt,
      messages: allMessages,
      _needsReexecution: false,
    };
  };
}
