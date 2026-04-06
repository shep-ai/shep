/**
 * Prompt Optimization Context
 *
 * Module-level singleton that exposes the token-optimization layer to
 * executeNode() in node-helpers.ts without changing its public API.
 *
 * The worker calls setPromptOptimizationContext() once after DI init.
 * Node helpers call optimizePromptIfEnabled() before invoking the agent
 * executor and recordOptimizationMetricsIfEnabled() after the phase
 * timing record is updated.
 *
 * Errors are swallowed so optimization failures never block graph execution.
 */

import type { IPromptOptimizerService } from '@/application/ports/output/services/prompt-optimizer.interface.js';
import type { IOptimizationMetricsService } from '@/application/ports/output/services/optimization-metrics.interface.js';
import type { OptimizationMetrics } from '@/application/ports/output/services/prompt-optimizer.interface.js';
import type { TokenOptimizationConfig } from '@/domain/generated/output.js';
import { hasSettings, getSettings } from '@/infrastructure/services/settings.service.js';

let contextOptimizer: IPromptOptimizerService | undefined;
let contextMetricsService: IOptimizationMetricsService | undefined;
let contextRunId: string | undefined;
let contextFeatureId: string | undefined;

/**
 * Set the prompt-optimization context. Called once by the worker after DI init.
 */
export function setPromptOptimizationContext(
  optimizer: IPromptOptimizerService,
  metricsService: IOptimizationMetricsService,
  runId: string,
  featureId: string
): void {
  contextOptimizer = optimizer;
  contextMetricsService = metricsService;
  contextRunId = runId;
  contextFeatureId = featureId;
}

/**
 * Clear the prompt-optimization context. Useful for testing.
 */
export function clearPromptOptimizationContext(): void {
  contextOptimizer = undefined;
  contextMetricsService = undefined;
  contextRunId = undefined;
  contextFeatureId = undefined;
}

/** Result of an optimization attempt — exposes the prompt to send and metrics to record. */
export interface OptimizePromptResult {
  prompt: string;
  metrics: OptimizationMetrics | null;
  specFileHashes: Record<string, string>;
}

/**
 * Resolve the effective TokenOptimizationConfig from settings. Returns
 * undefined if settings are not initialized.
 */
function resolveConfig(): TokenOptimizationConfig | undefined {
  if (!hasSettings()) return undefined;
  return getSettings().workflow?.tokenOptimization;
}

/**
 * Optimize the given prompt if the optimizer context is set and the
 * master toggle is enabled. Falls back to a passthrough result on any
 * error so node execution is never blocked by optimization failures.
 */
export async function optimizePromptIfEnabled(
  prompt: string,
  phaseName: string,
  modelId: string | undefined,
  previousSpecFileHashes: Record<string, string> | undefined
): Promise<OptimizePromptResult> {
  if (!contextOptimizer || !contextRunId || !contextFeatureId) {
    return { prompt, metrics: null, specFileHashes: previousSpecFileHashes ?? {} };
  }

  const config = resolveConfig();
  if (!config?.enabled) {
    return { prompt, metrics: null, specFileHashes: previousSpecFileHashes ?? {} };
  }

  try {
    const result = await contextOptimizer.optimize(prompt, {
      phaseName,
      modelId,
      featureId: contextFeatureId,
      agentRunId: contextRunId,
      previousSpecFileHashes,
      config,
    });
    return {
      prompt: result.prompt,
      metrics: result.metrics,
      specFileHashes: result.specFileHashes,
    };
  } catch {
    // Swallow — optimization failure must never block phase execution
    return { prompt, metrics: null, specFileHashes: previousSpecFileHashes ?? {} };
  }
}

/**
 * Persist optimization metrics on the given phase timing row.
 * No-op if context is not set, timingId is null, or metrics are null.
 */
export async function recordOptimizationMetricsIfEnabled(
  timingId: string | null,
  metrics: OptimizationMetrics | null
): Promise<void> {
  if (!contextMetricsService || !timingId || !metrics) return;

  try {
    await contextMetricsService.record(timingId, metrics);
  } catch {
    // Swallow — metrics persistence failure is non-fatal
  }
}
