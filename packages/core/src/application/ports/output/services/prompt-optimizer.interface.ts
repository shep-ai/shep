/**
 * Prompt Optimizer Service Interface
 *
 * Output port for the token optimization layer. Orchestrates all
 * optimization capabilities (output filtering, skill routing,
 * delta-context diffing, semantic compression, alias compression)
 * to reduce prompt token consumption before LLM invocation.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides the composable pipeline implementation
 */

import type { TokenOptimizationConfig } from '../../../../domain/generated/output.js';

/**
 * Context provided to the optimizer for intelligent optimization decisions.
 */
export interface PromptOptimizationContext {
  /** Current graph node / workflow phase name (e.g., 'analyze', 'implement') */
  phaseName: string;
  /** Model identifier for the downstream executor */
  modelId?: string;
  /** Feature ID for per-feature settings lookup */
  featureId: string;
  /** Agent run ID for metrics correlation */
  agentRunId: string;
  /** Previous spec file hashes for delta-context diffing */
  previousSpecFileHashes?: Record<string, string>;
  /** Optimization config override (if not provided, reads from global settings) */
  config?: TokenOptimizationConfig;
}

/**
 * Per-capability metrics collected during optimization.
 */
export interface OptimizationMetrics {
  /** Estimated tokens before optimization (chars / 4 heuristic) */
  originalTokenEstimate: number;
  /** Estimated tokens after optimization (chars / 4 heuristic) */
  optimizedTokenEstimate: number;
  /** Percentage of tokens saved ((original - optimized) / original * 100) */
  savingsPercent: number;
  /** List of optimization capability names that were applied */
  capabilitiesApplied: string[];
  /** Lines removed by command output filter */
  outputFilterLinesRemoved: number;
  /** Spec files replaced with compact summaries by delta-context */
  deltaContextFilesSkipped: number;
  /** Compression ratio from semantic compression (compressed / original) */
  compressionRatio: number;
  /** Number of alias substitutions created */
  aliasesCreated: number;
}

/**
 * Result returned by the prompt optimizer.
 */
export interface PromptOptimizationResult {
  /** The optimized prompt string */
  prompt: string;
  /** Optimization metrics for tracking and reporting */
  metrics: OptimizationMetrics;
  /** Updated spec file hashes for delta-context (store in LangGraph state) */
  specFileHashes: Record<string, string>;
}

/**
 * Service interface for the token optimization layer.
 *
 * Orchestrates all optimization capabilities based on settings toggles,
 * applying them in sequence: output filter -> skill router -> delta-context
 * -> semantic compressor -> alias engine.
 */
export interface IPromptOptimizerService {
  /**
   * Optimize a raw prompt string to reduce token consumption.
   *
   * Applies enabled optimization capabilities in sequence and returns
   * the optimized prompt with metrics. If optimization is disabled
   * (master toggle off), returns the original prompt with zero-delta metrics.
   *
   * @param prompt - Raw prompt string from buildPrompt()
   * @param context - Phase context for intelligent optimization decisions
   * @returns Optimized prompt, metrics, and updated spec file hashes
   */
  optimize(prompt: string, context: PromptOptimizationContext): Promise<PromptOptimizationResult>;
}
