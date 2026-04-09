/**
 * Prompt Optimizer Service
 *
 * Top-level orchestrator for the token optimization layer. Composes the
 * five capability services (delta-context, command output filter, skill
 * routing, semantic compressor, alias compression) into a sequential
 * pipeline driven by per-capability settings toggles.
 *
 * Pipeline order (from research decisions):
 *   1. Output filter   - removes the most raw text early
 *   2. Skill routing   - prepends a small directive section
 *   3. Delta-context   - replaces unchanged spec files with summaries
 *   4. Semantic compr  - compresses remaining natural language
 *   5. Alias engine    - finds repeated long strings in the final text
 *
 * Each stage runs only when its individual toggle is true. The master
 * toggle (config.enabled) short-circuits the pipeline entirely.
 *
 * Metrics from each stage are aggregated into the OptimizationMetrics
 * record returned alongside the optimized prompt.
 */

import { injectable, inject } from 'tsyringe';

import type {
  IPromptOptimizerService,
  PromptOptimizationContext,
  PromptOptimizationResult,
  OptimizationMetrics,
} from '@/application/ports/output/services/prompt-optimizer.interface.js';
import type { ICommandOutputFilterService } from '@/application/ports/output/services/command-output-filter.interface.js';
import type { ISkillRoutingService } from '@/application/ports/output/services/skill-routing.interface.js';
import type { IDeltaContextService } from '@/application/ports/output/services/delta-context.interface.js';
import type { ISemanticCompressorService } from '@/application/ports/output/services/semantic-compressor.interface.js';
import type { IAliasCompressionService } from '@/application/ports/output/services/alias-compression.interface.js';
import type { IOptimizationMetricsService } from '@/application/ports/output/services/optimization-metrics.interface.js';

/** Token estimate heuristic: chars / TOKEN_CHAR_RATIO. */
const TOKEN_CHAR_RATIO = 4;

/** Capability identifier strings recorded in metrics.capabilitiesApplied. */
const CAPABILITY = {
  outputFiltering: 'outputFiltering',
  skillRouting: 'skillRouting',
  deltaContext: 'deltaContext',
  semanticCompression: 'semanticCompression',
  aliasCompression: 'aliasCompression',
} as const;

/** Estimate tokens from character length using the chars/4 heuristic. */
function estimateTokens(text: string): number {
  return Math.floor(text.length / TOKEN_CHAR_RATIO);
}

/** Build a zero-delta metrics record (used when no optimization is applied). */
function buildPassthroughMetrics(prompt: string): OptimizationMetrics {
  const tokens = estimateTokens(prompt);
  return {
    originalTokenEstimate: tokens,
    optimizedTokenEstimate: tokens,
    savingsPercent: 0,
    capabilitiesApplied: [],
    outputFilterLinesRemoved: 0,
    deltaContextFilesSkipped: 0,
    compressionRatio: 1.0,
    aliasesCreated: 0,
  };
}

@injectable()
export class PromptOptimizerService implements IPromptOptimizerService {
  constructor(
    @inject('ICommandOutputFilterService')
    private readonly outputFilter: ICommandOutputFilterService,
    @inject('ISkillRoutingService')
    private readonly skillRouting: ISkillRoutingService,
    @inject('IDeltaContextService')
    private readonly deltaContext: IDeltaContextService,
    @inject('ISemanticCompressorService')
    private readonly semanticCompressor: ISemanticCompressorService,
    @inject('IAliasCompressionService')
    private readonly aliasCompression: IAliasCompressionService,
    @inject('IOptimizationMetricsService')
    private readonly metricsService: IOptimizationMetricsService
  ) {}

  /**
   * Optimize a raw prompt by running enabled capability services in sequence.
   *
   * Returns the original prompt with zero-delta metrics when the master
   * toggle is off. Each capability is independently skippable via its
   * config toggle.
   */
  async optimize(
    prompt: string,
    context: PromptOptimizationContext
  ): Promise<PromptOptimizationResult> {
    const config = context.config;

    // Master toggle off — return prompt unchanged with zero-delta metrics.
    if (!config?.enabled) {
      return {
        prompt,
        metrics: buildPassthroughMetrics(prompt),
        specFileHashes: context.previousSpecFileHashes ?? {},
      };
    }

    const originalTokenEstimate = estimateTokens(prompt);
    const capabilitiesApplied: string[] = [];
    let working = prompt;

    // Per-capability metric accumulators
    let outputFilterLinesRemoved = 0;
    const deltaContextFilesSkipped = 0;
    let compressionRatio = 1.0;
    let aliasesCreated = 0;
    const specFileHashes: Record<string, string> = context.previousSpecFileHashes ?? {};

    // 1. Command output filter — remove the most raw text first.
    if (config.outputFiltering) {
      const result = this.outputFilter.filter(working);
      working = result.filtered;
      outputFilterLinesRemoved = result.linesRemoved;
      capabilitiesApplied.push(CAPABILITY.outputFiltering);
    }

    // 2. Skill routing — prepend the phase-relevant skill directive.
    if (config.skillRouting) {
      const routing = this.skillRouting.getRoutingDirective(context.phaseName);
      if (routing.directive.length > 0) {
        working = `${routing.directive}\n\n${working}`;
      }
      capabilitiesApplied.push(CAPABILITY.skillRouting);
    }

    // 3. Delta-context — note: the orchestrator does not own spec file
    //    reads (those happen in prompt builders). When invoked here we
    //    simply mark the capability as applied and propagate hashes from
    //    context. The capability service is exposed for direct use by
    //    prompt builders that want to apply hash-based summaries inline.
    if (config.deltaContext) {
      capabilitiesApplied.push(CAPABILITY.deltaContext);
    }

    // 4. Semantic compressor — compress remaining natural language.
    if (config.semanticCompression) {
      const result = this.semanticCompressor.compress(working);
      working = result.compressed;
      compressionRatio = result.compressionRatio;
      capabilitiesApplied.push(CAPABILITY.semanticCompression);
    }

    // 5. Alias engine — find repeated long strings in the final text.
    if (config.aliasCompression) {
      const result = this.aliasCompression.compress(working);
      working = result.compressed;
      aliasesCreated = result.aliasCount;
      capabilitiesApplied.push(CAPABILITY.aliasCompression);
    }

    const optimizedTokenEstimate = estimateTokens(working);

    // Total-net-positive gate. Per-capability overheads — specifically
    // the skill-routing directive header and the alias dictionary header —
    // are fixed costs that can exceed savings on short prompts. When that
    // happens, returning the "optimized" prompt actively hurts: the layer
    // makes the prompt larger in the name of making it smaller. Fall back
    // to the original whenever the pipeline is not net-positive.
    //
    // Measured against the real 844-token fast-implement seed prompt on
    // the shep-website A/B test: all-capabilities-on produced an 860-token
    // output (-1.9%), driven by a 40-token skill-routing directive. With
    // this gate active, such prompts pass through unchanged.
    if (optimizedTokenEstimate >= originalTokenEstimate) {
      const passthroughMetrics: OptimizationMetrics = {
        originalTokenEstimate,
        optimizedTokenEstimate: originalTokenEstimate,
        savingsPercent: 0,
        capabilitiesApplied: [],
        outputFilterLinesRemoved: 0,
        deltaContextFilesSkipped: 0,
        compressionRatio: 1.0,
        aliasesCreated: 0,
      };
      this.logSummary(context, passthroughMetrics);
      await this.recordMetricsIfPossible(context, passthroughMetrics);
      return {
        prompt,
        metrics: passthroughMetrics,
        specFileHashes,
      };
    }

    const savingsPercent =
      originalTokenEstimate > 0
        ? ((originalTokenEstimate - optimizedTokenEstimate) / originalTokenEstimate) * 100
        : 0;

    const metrics: OptimizationMetrics = {
      originalTokenEstimate,
      optimizedTokenEstimate,
      savingsPercent: Math.max(0, savingsPercent),
      capabilitiesApplied,
      outputFilterLinesRemoved,
      deltaContextFilesSkipped,
      compressionRatio,
      aliasesCreated,
    };

    this.logSummary(context, metrics);
    await this.recordMetricsIfPossible(context, metrics);

    return {
      prompt: working,
      metrics,
      specFileHashes,
    };
  }

  /**
   * Persist metrics via the metrics service when a phaseTimingId is
   * provided in the context. Failures are swallowed so a metrics
   * persistence problem can never break the optimization pipeline.
   */
  private async recordMetricsIfPossible(
    context: PromptOptimizationContext,
    metrics: OptimizationMetrics
  ): Promise<void> {
    if (!context.phaseTimingId) {
      return;
    }
    try {
      await this.metricsService.record(context.phaseTimingId, metrics);
    } catch {
      // Metrics persistence failure must never break optimization
    }
  }

  /**
   * Log a debug-level summary of optimizations applied for observability.
   * Failure to log must never affect optimization output.
   */
  private logSummary(context: PromptOptimizationContext, metrics: OptimizationMetrics): void {
    try {
      const savings = metrics.savingsPercent.toFixed(1);
      const caps = metrics.capabilitiesApplied.join(',');
      // Use process.stderr.write at debug level (no console pollution)
      if (process.env.SHEP_DEBUG_OPTIMIZER === '1') {
        process.stderr.write(
          `[token-optimizer] phase=${context.phaseName} ` +
            `original=${metrics.originalTokenEstimate} ` +
            `optimized=${metrics.optimizedTokenEstimate} ` +
            `savings=${savings}% ` +
            `capabilities=${caps}\n`
        );
      }
    } catch {
      // Logging failure must never break optimization
    }
  }
}
