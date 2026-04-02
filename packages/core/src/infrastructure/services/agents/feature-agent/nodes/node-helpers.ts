/**
 * Shared foundation for feature-agent graph nodes.
 *
 * Provides consistent logging, spec file reading, executor invocation,
 * and error handling so every node follows the same patterns.
 */

import yaml from 'js-yaml';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { interrupt, isGraphBubbleUp } from '@langchain/langgraph';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import type { ApprovalGates, Evidence } from '@/domain/generated/output.js';
import { hasSettings, getSettings } from '@/infrastructure/services/settings.service.js';
import type { FeatureAgentState } from '../state.js';
import { reportNodeStart } from '../heartbeat.js';
import {
  recordPhaseStart,
  recordPhaseEnd,
  recordApprovalWaitStart,
} from '../phase-timing-context.js';
import { updateNodeLifecycle } from '../lifecycle-context.js';
import { getLogPrefix, setCurrentPhase } from '../log-context.js';

/**
 * Create a scoped logger that prefixes messages with the node name.
 * Output goes to stdout which the worker redirects to the log file.
 * Also sets the current phase so executor logs inherit the node context.
 */
export function createNodeLogger(nodeName: string) {
  return {
    /** Activate this node's phase in the global log context. */
    activate(): void {
      setCurrentPhase(nodeName);
    },
    info(message: string): void {
      const ts = new Date().toISOString();
      process.stdout.write(`[${ts}] [${nodeName}] ${getLogPrefix()}${message}\n`);
    },
    error(message: string): void {
      const ts = new Date().toISOString();
      process.stderr.write(`[${ts}] [${nodeName}] ${getLogPrefix()}ERROR: ${message}\n`);
    },
  };
}

export type NodeLogger = ReturnType<typeof createNodeLogger>;

/**
 * Safely read a file from the spec directory. Returns empty string if file doesn't exist.
 */
export function readSpecFile(specDir: string, filename: string): string {
  try {
    return readFileSync(join(specDir, filename), 'utf-8');
  } catch {
    return '';
  }
}

/** Default timeout per agent call (30 minutes) — prevents infinite hangs. */
const DEFAULT_STAGE_TIMEOUT_MS = 1_800_000;

/**
 * Map from node name to the corresponding StageTimeouts field.
 * `fast-implement` has its own dedicated timeout; `evidence` reuses implement.
 */
const STAGE_TIMEOUT_KEY: Record<string, string> = {
  analyze: 'analyzeMs',
  requirements: 'requirementsMs',
  research: 'researchMs',
  plan: 'planMs',
  implement: 'implementMs',
  'fast-implement': 'fastImplementMs',
  'prototype-generate': 'implementMs',
  evidence: 'implementMs',
  merge: 'mergeMs',
};

/**
 * Resolve the timeout for a specific stage.
 * Reads per-stage timeout from settings (workflow.stageTimeouts.<stage>Ms),
 * falling back to DEFAULT_STAGE_TIMEOUT_MS when not configured.
 */
export function getStageTimeoutMs(nodeName: string): number {
  if (!hasSettings()) return DEFAULT_STAGE_TIMEOUT_MS;
  const timeouts = getSettings().workflow?.stageTimeouts;
  if (!timeouts) return DEFAULT_STAGE_TIMEOUT_MS;
  const key = STAGE_TIMEOUT_KEY[nodeName];
  if (!key) return DEFAULT_STAGE_TIMEOUT_MS;
  return (timeouts as Record<string, number | undefined>)[key] ?? DEFAULT_STAGE_TIMEOUT_MS;
}

/**
 * Build executor options with cwd. Each node gets a clean agent context.
 * The timeout is resolved per-stage from settings (workflow.stageTimeouts)
 * with a fallback to DEFAULT_STAGE_TIMEOUT_MS (10 min).
 *
 * When no `nodeName` is provided, the current node from state is used.
 */
export function buildExecutorOptions(
  state: FeatureAgentState,
  overrides?: Partial<Pick<AgentExecutionOptions, 'timeout'>>,
  nodeName?: string
): AgentExecutionOptions {
  const stage = nodeName ?? state.currentNode ?? '';
  const stageTimeout = getStageTimeoutMs(stage);
  return {
    cwd: state.worktreePath || state.repositoryPath,
    maxTurns: 5000,
    timeout: stageTimeout,
    ...(state.model ? { model: state.model } : {}),
    ...overrides,
  };
}

/**
 * Sanitize YAML content to handle common AI-generated issues.
 * Quotes unquoted list items containing `{` or `}` characters
 * which js-yaml interprets as flow mappings.
 */
function sanitizeYamlBraces(content: string): string {
  return content.replace(
    /^(\s*- )(?!['"])(.+[{}].+)$/gm,
    (_match, prefix: string, value: string) =>
      `${prefix}"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  );
}

/**
 * Parse YAML with automatic sanitization of common AI-generated issues.
 * First attempts normal parsing; on failure, sanitizes unquoted braces
 * in list items and retries.
 */
export function safeYamlLoad(content: string): unknown {
  try {
    return yaml.load(content);
  } catch (firstError) {
    const sanitized = sanitizeYamlBraces(content);
    if (sanitized === content) throw firstError; // nothing to sanitize
    return yaml.load(sanitized);
  }
}

/**
 * Serialization options for safeYamlDump.
 * - indent: 2 spaces (consistent with codebase style)
 * - lineWidth: -1 (disable line wrapping to preserve agent-written formatting)
 * - quotingType: '"' (use double quotes for all quoted strings)
 * - forceQuotes: true (quote all string values to prevent YAML parse errors from unescaped special characters)
 */
const SAFE_YAML_DUMP_OPTIONS = {
  indent: 2,
  lineWidth: -1,
  quotingType: '"' as const,
  forceQuotes: true,
};

/**
 * Serialize data to YAML with forced double-quoting for all string values.
 *
 * This helper ensures all YAML output uses consistent quoting to prevent
 * parse failures from unescaped quotes, colons, hashes, and other special
 * characters in AI-generated content.
 *
 * **When to use:**
 * - Use `safeYamlDump` for all YAML serialization in feature-agent nodes,
 *   use cases, and CLI output to ensure consistency and reliability.
 * - Do NOT use `yaml.dump` directly unless you have a specific need for
 *   unquoted strings (e.g., human-edited configuration files).
 *
 * **Options applied:**
 * - `indent: 2` — 2-space indentation (codebase standard)
 * - `lineWidth: -1` — Disable line wrapping to preserve formatting and reduce diff noise
 * - `quotingType: '"'` — Use double quotes for all quoted strings
 * - `forceQuotes: true` — Quote all string values, even those without special characters
 *
 * @param data - The data to serialize (objects, arrays, primitives)
 * @returns YAML string with all strings double-quoted
 *
 * @example
 * ```typescript
 * const yaml = safeYamlDump({ title: "it's working", description: "say \"hello\"" });
 * // Output:
 * // title: "it's working"
 * // description: "say \"hello\""
 * ```
 */
export function safeYamlDump(data: unknown): string {
  return yaml.dump(data, SAFE_YAML_DUMP_OPTIONS);
}

/**
 * Determine whether the current node should trigger an interrupt
 * for human approval given the configured approval gates.
 *
 * Gates control which phases auto-approve:
 * - allowPrd: when true, skip interrupt after requirements phase
 * - allowPlan: when true, skip interrupt after plan phase
 * - allowMerge: when true, skip interrupt after merge phase
 *
 * Nodes not covered by a gate (analyze, research, implement) never interrupt.
 * Implementation always proceeds to merge; the merge node handles its own gate.
 *
 */
export function shouldInterrupt(nodeName: string, gates: ApprovalGates | undefined): boolean {
  if (!gates) return false;

  if (gates.allowPrd && gates.allowPlan && gates.allowMerge) return false;
  if (nodeName === 'requirements') return !gates.allowPrd;
  if (nodeName === 'plan') return !gates.allowPlan;
  if (nodeName === 'merge') return !gates.allowMerge;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Error classification & retry                                      */
/* ------------------------------------------------------------------ */

export type ErrorCategory = 'retryable-api' | 'retryable-network' | 'non-retryable' | 'unknown';

const API_ERROR_RE = /API Error: (400|429|5\d{2})/;
const NETWORK_ERROR_RE = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network timed out/i;
const NON_RETRYABLE_RE = /Process exited with code|ENOENT|SyntaxError|Agent execution timed out/;

/**
 * Classify an error message into a retry category.
 *
 * - **retryable-api**: Transient API errors (rate-limit, overload, bad request)
 * - **retryable-network**: Network-level failures (DNS, timeouts, connection refused)
 * - **non-retryable**: Logic / filesystem / syntax errors that won't resolve on retry
 * - **unknown**: Anything unrecognised (callers may choose to retry cautiously)
 */
export function classifyError(errorMessage: string): ErrorCategory {
  if (API_ERROR_RE.test(errorMessage)) return 'retryable-api';
  if (NETWORK_ERROR_RE.test(errorMessage)) return 'retryable-network';
  if (NON_RETRYABLE_RE.test(errorMessage)) return 'non-retryable';
  return 'unknown';
}

export interface RetryOptions {
  /** Maximum number of execution attempts (default 3). */
  maxAttempts?: number;
  /** Base delay in ms before the first retry (default 2000). Doubles each retry. */
  baseDelayMs?: number;
  /** Optional logger for retry messages. */
  logger?: NodeLogger;
}

/**
 * Execute a prompt via the given executor with automatic retry and
 * exponential back-off for transient errors.
 *
 * Non-retryable errors are thrown immediately. Unknown errors are
 * retried (conservative stance: could be transient).
 */
export async function retryExecute(
  executor: IAgentExecutor,
  prompt: string,
  options: AgentExecutionOptions,
  retryOpts?: RetryOptions
): Promise<AgentExecutionResult> {
  const maxAttempts = retryOpts?.maxAttempts ?? 3;
  const baseDelayMs = retryOpts?.baseDelayMs ?? 2000;
  const log = retryOpts?.logger;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await executor.execute(prompt, options);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const category = classifyError(lastError.message);

      if (category === 'non-retryable') {
        throw lastError;
      }

      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        log?.info(
          `Attempt ${attempt}/${maxAttempts} failed (${category}), retrying in ${delayMs}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError!;
}

/**
 * Read completed phases from feature.yaml.
 */
export function getCompletedPhases(specDir: string): string[] {
  const content = readSpecFile(specDir, 'feature.yaml');
  if (!content) return [];
  try {
    const data = yaml.load(content) as Record<string, unknown>;
    const status = (data?.status ?? {}) as Record<string, unknown>;
    const phases = status.completedPhases;
    return Array.isArray(phases) ? phases : [];
  } catch {
    return [];
  }
}

/**
 * Remove a phase from completedPhases in feature.yaml.
 * Used when a phase is rejected and needs to re-execute.
 */
export function clearCompletedPhase(specDir: string, phaseId: string, log?: NodeLogger): void {
  try {
    const content = readSpecFile(specDir, 'feature.yaml');
    if (!content) return;
    const data = yaml.load(content) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return;
    const status = (data.status ?? {}) as Record<string, unknown>;
    const completedPhases = Array.isArray(status.completedPhases)
      ? status.completedPhases.filter((p: string) => p !== phaseId)
      : [];
    data.status = { ...status, completedPhases };
    writeFileSync(join(specDir, 'feature.yaml'), safeYamlDump(data), 'utf-8');
  } catch (err) {
    log?.error(
      `Failed to clear completed phase: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Type guard to detect rejection payloads from interrupt() return value.
 */
export function isRejectionPayload(value: unknown): value is { rejected: true; feedback: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'rejected' in value &&
    (value as Record<string, unknown>).rejected === true
  );
}

/**
 * Mark a phase as complete in feature.yaml by adding its ID to completedPhases.
 */
export function markPhaseComplete(specDir: string, phaseId: string, log?: NodeLogger): void {
  try {
    const content = readSpecFile(specDir, 'feature.yaml');
    if (!content) return;
    const data = yaml.load(content) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return;
    const status = (data.status ?? {}) as Record<string, unknown>;
    const completedPhases = Array.isArray(status.completedPhases)
      ? [...status.completedPhases]
      : [];
    if (!completedPhases.includes(phaseId)) {
      completedPhases.push(phaseId);
    }
    data.status = { ...status, completedPhases };
    writeFileSync(join(specDir, 'feature.yaml'), safeYamlDump(data), 'utf-8');
  } catch (err) {
    log?.error(
      `Failed to mark phase complete: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Write a spec file atomically using temp-file-then-rename pattern.
 * Prevents corruption on crash mid-write.
 */
export function writeSpecFileAtomic(specDir: string, filename: string, content: string): void {
  const targetPath = join(specDir, filename);
  const tempPath = join(specDir, `.${filename}.tmp`);
  try {
    writeFileSync(tempPath, content, 'utf-8');
    renameSync(tempPath, targetPath);
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
      // Temp file already renamed or doesn't exist
    }
  }
}

/**
 * Build a commit + optional push instruction block for prompt suffixes.
 *
 * Used by phase prompts to instruct the agent to commit spec/code changes
 * at the end of each step, and optionally push when the --push flag is set.
 */
export function buildCommitPushBlock(opts: {
  push: boolean;
  files: string[];
  commitHint: string;
  /** Skip build/test/lint verification (for spec-only phases that don't modify source code) */
  skipVerification?: boolean;
}): string {
  const fileList = opts.files.map((f) => `\`${f}\``).join(', ');
  const lines = [
    `## Final Step — Commit Your Work`,
    ``,
    `After completing all tasks above:`,
    `1. Stage the changed files: ${fileList} (use \`git add\` with the specific paths)`,
    `2. Commit with a conventional commit message${opts.skipVerification ? ' using `--no-verify` to skip hooks' : ''} — e.g. \`git commit${opts.skipVerification ? ' --no-verify' : ''} -m "${opts.commitHint}"\``,
    `   - The message should accurately describe what changed`,
  ];
  if (opts.push && !opts.skipVerification) {
    lines.push(`3. Run local verification before pushing:`);
    lines.push(`   - \`pnpm build\` — must compile without errors`);
    lines.push(`   - \`pnpm test\` — all tests must pass`);
    lines.push(`   - \`pnpm lint\` — no lint errors`);
    lines.push(`   - Fix any issues found before proceeding to push`);
    lines.push(``);
    lines.push(`**CRITICAL — Never run destructive git commands during verification.**`);
    lines.push(
      `Do NOT run \`git stash\`, \`git reset\`, \`git checkout -- .\`, \`git restore\`, or \`git clean\` under any circumstances.`
    );
    lines.push(
      `These commands can destroy uncommitted work. If a test fails and you believe it is unrelated to your changes, proceed with the commit and push anyway — do NOT attempt to prove the failure is pre-existing.`
    );
    lines.push(``);
    lines.push(`4. Push to remote: \`git push -u origin HEAD\``);
    lines.push(`   - Do NOT wait for or watch CI — just push and finish`);
  } else if (opts.push && opts.skipVerification) {
    lines.push(`3. Push to remote: \`git push -u origin HEAD\``);
    lines.push(`   - Do NOT wait for or watch CI — just push and finish`);
    lines.push(`   - Do NOT run build, test, or lint — this phase only modifies spec files`);
  }
  return lines.join('\n');
}

/**
 * Build a resume context prefix for the agent prompt.
 *
 * When a run is resumed after being stopped/failed/crashed, this provides
 * context so the agent knows to check existing work before proceeding.
 */
export function buildResumeContext(resumeReason: string | undefined): string {
  if (!resumeReason) return '';
  return `## ⚠️ Resume Context

This is a **RESUMED** run. The previous execution was **${resumeReason}**.

Before proceeding with this phase:
1. Check what work was already completed — look at existing files, git status, and any partial output
2. Do NOT redo work that was already successfully completed
3. If there is partial work, evaluate whether to continue from it or start fresh
4. If the previous run failed due to an error, investigate whether the root cause still exists

`;
}

/** Spec-only phases whose commits should be removed when commitSpecs=false. */
const SPEC_PHASE_NODES = new Set(['analyze', 'requirements', 'research', 'plan']);

/**
 * Safety net: remove spec-file commits the agent made despite being told not to.
 *
 * When commitSpecs=false and the agent ignored the "do NOT commit" instruction,
 * this function finds the most recent commit that touches the spec directory and
 * soft-resets it so the files remain on disk (for local use) but are not committed.
 */
export function removeSpecCommitsIfNeeded(
  state: FeatureAgentState,
  nodeName: string,
  log: NodeLogger
): void {
  if (state.commitSpecs) return;
  if (!SPEC_PHASE_NODES.has(nodeName)) return;

  const cwd = state.worktreePath || state.repositoryPath;
  const specRelDir = relative(cwd, state.specDir).replaceAll('\\', '/');

  try {
    // Check if HEAD commit touches spec files
    const filesInHead = execSync(`git diff --name-only HEAD~1 HEAD -- "${specRelDir}"`, {
      cwd,
      encoding: 'utf-8',
      windowsHide: true,
    }).trim();

    if (!filesInHead) return;

    log.info(
      `commitSpecs=false but agent committed spec files: ${filesInHead.split('\n').join(', ')}. Soft-resetting to undo.`
    );

    // Soft-reset the last commit so spec files are unstaged but kept on disk
    execSync('git reset --soft HEAD~1', { cwd, windowsHide: true });
    // Unstage the spec files (keep them as untracked/modified on disk)
    execSync(`git reset HEAD -- "${specRelDir}"`, { cwd, windowsHide: true });
  } catch {
    // If git commands fail (e.g., no prior commit, detached HEAD), log and continue
    log.info('Failed to check/remove spec commits — continuing');
  }
}

/**
 * Execute a node with consistent logging and error handling.
 *
 * Wraps the node's core logic with:
 * - Entry/exit logging with timing
 * - Error catching that returns error state instead of throwing
 * - Consistent state shape for success and failure
 */
export function executeNode(
  nodeName: string,
  executor: IAgentExecutor,
  buildPrompt: (state: FeatureAgentState, log: NodeLogger) => string
): (state: FeatureAgentState) => Promise<Partial<FeatureAgentState>> {
  const log = createNodeLogger(nodeName);

  return async (state: FeatureAgentState): Promise<Partial<FeatureAgentState>> => {
    log.activate();
    log.info('Starting...');
    reportNodeStart(nodeName);

    // Update feature lifecycle to reflect the current phase
    await updateNodeLifecycle(nodeName);

    // On resume from interrupt, LangGraph re-executes the node function from
    // the top. Instead of re-executing within this invocation (which would
    // require a second interrupt() call and trigger the stale-replay bug),
    // we return early. Rejection sets _needsReexecution=true so a conditional
    // edge in the graph routes back to this node for a fresh invocation.
    const completedPhases = getCompletedPhases(state.specDir);
    if (completedPhases.includes(nodeName)) {
      if (shouldInterrupt(nodeName, state.approvalGates)) {
        if (state._approvalAction === 'rejected') {
          const feedback = state._rejectionFeedback ?? '(no feedback)';
          log.info(`Phase rejected with feedback: "${feedback}" — scheduling re-execution`);
          clearCompletedPhase(state.specDir, nodeName, log);
          // Return early — the conditional edge will route back to this node
          // for a fresh invocation with a clean interrupt index.
          return {
            currentNode: nodeName,
            messages: [`[${nodeName}] Rejected — will re-execute`],
            _approvalAction: null,
            _rejectionFeedback: null,
            _needsReexecution: true,
          };
        } else {
          log.info('Phase approved, skipping re-execution');
          return {
            currentNode: nodeName,
            messages: [`[${nodeName}] Approved — continuing`],
            _approvalAction: null,
            _rejectionFeedback: null,
            _needsReexecution: false,
          };
        }
      } else {
        log.info('Phase already completed (no gate), skipping execution');
        return {
          currentNode: nodeName,
          messages: [`[${nodeName}] Approved — continuing`],
          _needsReexecution: false,
        };
      }
    }

    const startTime = Date.now();

    const resumePrefix = buildResumeContext(state.resumeReason);
    const prompt = resumePrefix + buildPrompt(state, log);
    const options = buildExecutorOptions(state, undefined, nodeName);

    // Record phase start with pre-execution metadata
    const timingId = await recordPhaseStart(nodeName, {
      prompt,
      modelId: state.model,
      agentType: executor.agentType,
    });

    try {
      log.info(`Executing agent at cwd=${options.cwd}`);
      log.info(`Prompt length: ${prompt.length} chars`);
      const result = await executor.execute(prompt, options);
      const durationMs = Date.now() - startTime;
      const elapsed = (durationMs / 1000).toFixed(1);
      log.info(`Complete (${result.result.length} chars, ${elapsed}s)`);

      // Record phase completion with post-execution metadata
      await recordPhaseEnd(timingId, durationMs, {
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        cacheCreationInputTokens: result.usage?.cacheCreationInputTokens,
        cacheReadInputTokens: result.usage?.cacheReadInputTokens,
        costUsd: result.usage?.costUsd,
        numTurns: result.usage?.numTurns,
        durationApiMs: result.usage?.durationApiMs,
        exitCode: 'success',
      });

      // Safety net: undo spec commits if commitSpecs=false
      removeSpecCommitsIfNeeded(state, nodeName, log);

      // Mark phase complete BEFORE interrupting so that on resume the
      // node detects the work is already done and returns early.
      markPhaseComplete(state.specDir, nodeName, log);

      const nodeResult: Partial<FeatureAgentState> = {
        currentNode: nodeName,
        messages: [`[${nodeName}] Complete (${result.result.length} chars, ${elapsed}s)`],
        _approvalAction: null,
        _rejectionFeedback: null,
        _needsReexecution: false,
      };

      // Human-in-the-loop: interrupt after node execution for review.
      // This is the ONLY interrupt() call in the entire execution path.
      // On resume, the node returns early (above) without calling interrupt(),
      // so there is no stale interrupt replay.
      if (shouldInterrupt(nodeName, state.approvalGates)) {
        log.info('Interrupting for human approval');
        await recordApprovalWaitStart(timingId);
        interrupt({
          node: nodeName,
          result: result.result.slice(0, 500),
          message: `Node "${nodeName}" completed. Approve to continue.`,
        });
      }

      return nodeResult;
    } catch (err: unknown) {
      // Re-throw LangGraph control-flow exceptions (interrupt, Command, etc.)
      if (isGraphBubbleUp(err)) throw err;

      const message = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;
      const elapsed = (durationMs / 1000).toFixed(1);
      log.error(`${message} (after ${elapsed}s)`);

      // Record phase end even on failure so timing shows duration, not "running"
      await recordPhaseEnd(timingId, durationMs, {
        exitCode: 'error',
        errorMessage: message.slice(0, 1000),
      });

      // Throw so LangGraph does NOT checkpoint this node as "completed".
      // The worker catch block marks the run as failed, and on resume
      // LangGraph re-executes from the last successfully checkpointed node.
      throw new Error(`[${nodeName}] ${message}`);
    }
  };
}

/**
 * Save evidence manifest to the shep home evidence folder so the
 * merge review UI can read it without accessing graph state.
 */
export function saveEvidenceManifest(
  state: FeatureAgentState,
  evidence: Evidence[],
  log: ReturnType<typeof createNodeLogger>
): void {
  if (evidence.length === 0) return;
  try {
    const cwd = state.worktreePath || state.repositoryPath;
    const repoHashDir = dirname(dirname(cwd));
    const evidenceDir = join(repoHashDir, 'evidence', state.featureId);
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(join(evidenceDir, 'manifest.json'), JSON.stringify(evidence, null, 2), 'utf-8');
    log.info(`Saved evidence manifest to ${evidenceDir}/manifest.json`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Failed to save evidence manifest: ${msg}`);
  }
}
