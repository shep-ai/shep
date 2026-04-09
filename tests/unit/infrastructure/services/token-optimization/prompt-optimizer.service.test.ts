/**
 * PromptOptimizerService Unit Tests
 *
 * Tests for the top-level prompt optimizer that orchestrates all five
 * capability services (delta-context, command output filter, skill routing,
 * semantic compressor, alias compression) based on settings toggles.
 *
 * TDD Phase: RED
 *
 * Tests use mocked capability services and verify:
 * - Correct delegation order when all enabled
 * - Per-capability skipping when individual toggles are off
 * - Master toggle off returns original prompt unchanged
 * - Metrics aggregation from all capability results
 * - Phase context propagation to capability services
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptOptimizerService } from '@/infrastructure/services/token-optimization/prompt-optimizer.service.js';
import type {
  ICommandOutputFilterService,
  CommandOutputFilterResult,
} from '@/application/ports/output/services/command-output-filter.interface.js';
import type {
  ISkillRoutingService,
  SkillRoutingResult,
} from '@/application/ports/output/services/skill-routing.interface.js';
import type {
  IDeltaContextService,
  DeltaContextResult,
} from '@/application/ports/output/services/delta-context.interface.js';
import type {
  ISemanticCompressorService,
  SemanticCompressionResult,
} from '@/application/ports/output/services/semantic-compressor.interface.js';
import type {
  IAliasCompressionService,
  AliasCompressionResult,
} from '@/application/ports/output/services/alias-compression.interface.js';
import type { IOptimizationMetricsService } from '@/application/ports/output/services/optimization-metrics.interface.js';
import type { PromptOptimizationContext } from '@/application/ports/output/services/prompt-optimizer.interface.js';
import type { TokenOptimizationConfig } from '@/domain/generated/output.js';

/** Build a fully-enabled token optimization config. */
function fullyEnabledConfig(): TokenOptimizationConfig {
  return {
    enabled: true,
    outputFiltering: true,
    skillRouting: true,
    deltaContext: true,
    semanticCompression: true,
    aliasCompression: true,
  };
}

/** Build a baseline optimization context. */
function baseContext(
  overrides: Partial<PromptOptimizationContext> = {}
): PromptOptimizationContext {
  return {
    phaseName: 'plan',
    featureId: 'feat-123',
    agentRunId: 'run-456',
    config: fullyEnabledConfig(),
    ...overrides,
  };
}

/** Create a mock command output filter that returns a deterministic result. */
function makeOutputFilterMock(
  override?: Partial<CommandOutputFilterResult>
): ICommandOutputFilterService {
  return {
    filter: vi.fn(
      (prompt: string): CommandOutputFilterResult => ({
        filtered: `${prompt}[FILTERED]`,
        linesRemoved: 5,
        ...override,
      })
    ),
  };
}

/** Create a mock skill routing service. */
function makeSkillRoutingMock(override?: Partial<SkillRoutingResult>): ISkillRoutingService {
  return {
    getRoutingDirective: vi.fn(
      (_phaseName: string): SkillRoutingResult => ({
        relevantSkills: ['skill-a', 'skill-b'],
        directive: '## Skills\nUse: skill-a, skill-b',
        ...override,
      })
    ),
  };
}

/** Create a mock delta-context service. */
function makeDeltaContextMock(override?: Partial<DeltaContextResult>): IDeltaContextService {
  return {
    diff: vi.fn(
      (): DeltaContextResult => ({
        optimizedFiles: { 'spec.yaml': '[unchanged]' },
        currentHashes: { 'spec.yaml': 'hash123' },
        filesSkipped: 1,
        ...override,
      })
    ),
  };
}

/** Create a mock semantic compressor service. Uses a global replace so long
 *  inputs with repeated 'the ' shrink meaningfully — that lets default
 *  pipelines stay net-positive against the optimizer's net-positive gate. */
function makeSemanticCompressorMock(
  override?: Partial<SemanticCompressionResult>
): ISemanticCompressorService {
  return {
    compress: vi.fn(
      (text: string): SemanticCompressionResult => ({
        compressed: text.replace(/the /g, ''),
        compressionRatio: 0.8,
        ...override,
      })
    ),
  };
}

/** Create a mock alias compression service. */
function makeAliasCompressionMock(
  override?: Partial<AliasCompressionResult>
): IAliasCompressionService {
  return {
    compress: vi.fn(
      (text: string): AliasCompressionResult => ({
        compressed: `## Aliases\n$A1 = "foo"\n\n${text}`,
        dictionaryHeader: '## Aliases\n$A1 = "foo"\n\n',
        aliasCount: 1,
        ...override,
      })
    ),
  };
}

/** Create a mock optimization metrics service. */
function makeMetricsServiceMock(): IOptimizationMetricsService {
  return {
    record: vi.fn().mockResolvedValue(undefined),
    getByPhaseTimingId: vi.fn().mockResolvedValue(null),
  };
}

/**
 * A prompt long enough that the default mock pipeline produces a net-smaller
 * output (the mocks add fixed overhead; this input has enough 'the ' for the
 * semantic compressor to remove more than the overhead adds). Use this in
 * tests that want the net-positive gate to NOT fire so capabilities still
 * show up in the aggregated metrics.
 */
const NET_POSITIVE_INPUT = `${'the '.repeat(60)}original prompt with command output`;

describe('PromptOptimizerService', () => {
  let outputFilter: ICommandOutputFilterService;
  let skillRouting: ISkillRoutingService;
  let deltaContext: IDeltaContextService;
  let semanticCompressor: ISemanticCompressorService;
  let aliasCompression: IAliasCompressionService;
  let metricsService: IOptimizationMetricsService;
  let service: PromptOptimizerService;

  beforeEach(() => {
    outputFilter = makeOutputFilterMock();
    skillRouting = makeSkillRoutingMock();
    deltaContext = makeDeltaContextMock();
    semanticCompressor = makeSemanticCompressorMock();
    aliasCompression = makeAliasCompressionMock();
    metricsService = makeMetricsServiceMock();
    service = new PromptOptimizerService(
      outputFilter,
      skillRouting,
      deltaContext,
      semanticCompressor,
      aliasCompression,
      metricsService
    );
  });

  // --- Master toggle behavior ---

  describe('master toggle', () => {
    it('returns original prompt unchanged when master toggle is off', async () => {
      const original = 'the original prompt content';
      const result = await service.optimize(
        original,
        baseContext({ config: { ...fullyEnabledConfig(), enabled: false } })
      );

      expect(result.prompt).toBe(original);
      expect(outputFilter.filter).not.toHaveBeenCalled();
      expect(skillRouting.getRoutingDirective).not.toHaveBeenCalled();
      expect(deltaContext.diff).not.toHaveBeenCalled();
      expect(semanticCompressor.compress).not.toHaveBeenCalled();
      expect(aliasCompression.compress).not.toHaveBeenCalled();
    });

    it('returns zero-savings metrics when master toggle is off', async () => {
      const original = 'the original prompt content';
      const result = await service.optimize(
        original,
        baseContext({ config: { ...fullyEnabledConfig(), enabled: false } })
      );

      expect(result.metrics.savingsPercent).toBe(0);
      expect(result.metrics.capabilitiesApplied).toEqual([]);
      expect(result.metrics.originalTokenEstimate).toBe(result.metrics.optimizedTokenEstimate);
    });

    it('preserves spec file hashes from context when master toggle is off', async () => {
      const original = 'prompt';
      const previousHashes = { 'spec.yaml': 'old-hash' };
      const result = await service.optimize(
        original,
        baseContext({
          config: { ...fullyEnabledConfig(), enabled: false },
          previousSpecFileHashes: previousHashes,
        })
      );

      expect(result.specFileHashes).toEqual(previousHashes);
    });
  });

  // --- Pipeline ordering when all enabled ---

  describe('pipeline ordering with all capabilities enabled', () => {
    it('invokes all five capability services when fully enabled', async () => {
      const original = 'the original prompt content with command output';
      await service.optimize(original, baseContext());

      expect(outputFilter.filter).toHaveBeenCalledTimes(1);
      expect(skillRouting.getRoutingDirective).toHaveBeenCalledTimes(1);
      expect(semanticCompressor.compress).toHaveBeenCalledTimes(1);
      expect(aliasCompression.compress).toHaveBeenCalledTimes(1);
    });

    it('passes the phase name to skill routing service', async () => {
      await service.optimize('prompt', baseContext({ phaseName: 'implement' }));

      expect(skillRouting.getRoutingDirective).toHaveBeenCalledWith('implement');
    });

    it('records all enabled capabilities in metrics.capabilitiesApplied', async () => {
      const result = await service.optimize(NET_POSITIVE_INPUT, baseContext());

      expect(result.metrics.capabilitiesApplied).toContain('outputFiltering');
      expect(result.metrics.capabilitiesApplied).toContain('skillRouting');
      expect(result.metrics.capabilitiesApplied).toContain('semanticCompression');
      expect(result.metrics.capabilitiesApplied).toContain('aliasCompression');
    });

    it('returns a non-empty optimized prompt', async () => {
      const result = await service.optimize('the prompt', baseContext());
      expect(typeof result.prompt).toBe('string');
      expect(result.prompt.length).toBeGreaterThan(0);
    });
  });

  // --- Per-capability toggle behavior ---

  describe('per-capability toggles', () => {
    it('skips command output filter when outputFiltering is off', async () => {
      const config = { ...fullyEnabledConfig(), outputFiltering: false };
      await service.optimize('prompt', baseContext({ config }));

      expect(outputFilter.filter).not.toHaveBeenCalled();
      expect(skillRouting.getRoutingDirective).toHaveBeenCalled();
      expect(semanticCompressor.compress).toHaveBeenCalled();
      expect(aliasCompression.compress).toHaveBeenCalled();
    });

    it('skips skill routing when skillRouting is off', async () => {
      const config = { ...fullyEnabledConfig(), skillRouting: false };
      await service.optimize('prompt', baseContext({ config }));

      expect(skillRouting.getRoutingDirective).not.toHaveBeenCalled();
      expect(outputFilter.filter).toHaveBeenCalled();
    });

    it('skips delta-context diffing when deltaContext is off', async () => {
      const config = { ...fullyEnabledConfig(), deltaContext: false };
      await service.optimize('prompt', baseContext({ config }));

      expect(deltaContext.diff).not.toHaveBeenCalled();
    });

    it('skips semantic compressor when semanticCompression is off', async () => {
      const config = { ...fullyEnabledConfig(), semanticCompression: false };
      await service.optimize('prompt', baseContext({ config }));

      expect(semanticCompressor.compress).not.toHaveBeenCalled();
      expect(outputFilter.filter).toHaveBeenCalled();
      expect(aliasCompression.compress).toHaveBeenCalled();
    });

    it('skips alias compression when aliasCompression is off', async () => {
      const config = { ...fullyEnabledConfig(), aliasCompression: false };
      await service.optimize('prompt', baseContext({ config }));

      expect(aliasCompression.compress).not.toHaveBeenCalled();
      expect(outputFilter.filter).toHaveBeenCalled();
      expect(semanticCompressor.compress).toHaveBeenCalled();
    });

    it('does not include disabled capabilities in capabilitiesApplied', async () => {
      const config = {
        ...fullyEnabledConfig(),
        outputFiltering: false,
        aliasCompression: false,
      };
      const result = await service.optimize(NET_POSITIVE_INPUT, baseContext({ config }));

      expect(result.metrics.capabilitiesApplied).not.toContain('outputFiltering');
      expect(result.metrics.capabilitiesApplied).not.toContain('aliasCompression');
      expect(result.metrics.capabilitiesApplied).toContain('skillRouting');
      expect(result.metrics.capabilitiesApplied).toContain('semanticCompression');
    });

    it('returns original prompt when all capabilities are individually disabled', async () => {
      const original = 'the original prompt';
      const config: TokenOptimizationConfig = {
        enabled: true,
        outputFiltering: false,
        skillRouting: false,
        deltaContext: false,
        semanticCompression: false,
        aliasCompression: false,
      };
      const result = await service.optimize(original, baseContext({ config }));

      expect(result.prompt).toBe(original);
      expect(result.metrics.capabilitiesApplied).toEqual([]);
    });
  });

  // --- Metrics aggregation ---

  describe('metrics aggregation', () => {
    it('aggregates outputFilterLinesRemoved from filter result', async () => {
      outputFilter = makeOutputFilterMock({ linesRemoved: 42 });
      service = new PromptOptimizerService(
        outputFilter,
        skillRouting,
        deltaContext,
        semanticCompressor,
        aliasCompression,
        metricsService
      );

      const result = await service.optimize(NET_POSITIVE_INPUT, baseContext());

      expect(result.metrics.outputFilterLinesRemoved).toBe(42);
    });

    it('aggregates compressionRatio from semantic compressor result', async () => {
      semanticCompressor = makeSemanticCompressorMock({ compressionRatio: 0.65 });
      service = new PromptOptimizerService(
        outputFilter,
        skillRouting,
        deltaContext,
        semanticCompressor,
        aliasCompression,
        metricsService
      );

      const result = await service.optimize(NET_POSITIVE_INPUT, baseContext());

      expect(result.metrics.compressionRatio).toBe(0.65);
    });

    it('aggregates aliasesCreated from alias compression result', async () => {
      aliasCompression = makeAliasCompressionMock({ aliasCount: 7 });
      service = new PromptOptimizerService(
        outputFilter,
        skillRouting,
        deltaContext,
        semanticCompressor,
        aliasCompression,
        metricsService
      );

      const result = await service.optimize(NET_POSITIVE_INPUT, baseContext());

      expect(result.metrics.aliasesCreated).toBe(7);
    });

    it('computes originalTokenEstimate from input prompt length', async () => {
      const original = 'a'.repeat(400);
      const result = await service.optimize(original, baseContext());

      // chars / 4 heuristic
      expect(result.metrics.originalTokenEstimate).toBe(100);
    });

    it('computes optimizedTokenEstimate from output prompt length', async () => {
      // Use a no-op filter chain so we know the final length deterministically
      outputFilter = {
        filter: vi.fn((p: string) => ({ filtered: p, linesRemoved: 0 })),
      };
      skillRouting = {
        getRoutingDirective: vi.fn(() => ({ relevantSkills: [], directive: '' })),
      };
      semanticCompressor = {
        compress: vi.fn((t: string) => ({ compressed: t, compressionRatio: 1.0 })),
      };
      aliasCompression = {
        compress: vi.fn((t: string) => ({
          compressed: t,
          dictionaryHeader: '',
          aliasCount: 0,
        })),
      };
      service = new PromptOptimizerService(
        outputFilter,
        skillRouting,
        deltaContext,
        semanticCompressor,
        aliasCompression,
        metricsService
      );

      const original = 'b'.repeat(800);
      const result = await service.optimize(original, baseContext());

      expect(result.metrics.optimizedTokenEstimate).toBe(200);
    });

    it('computes savingsPercent based on token estimate delta', async () => {
      // Make the compressor cut the prompt in half
      semanticCompressor = {
        compress: vi.fn((t: string) => ({
          compressed: t.slice(0, Math.floor(t.length / 2)),
          compressionRatio: 0.5,
        })),
      };
      // No-op other capabilities
      outputFilter = {
        filter: vi.fn((p: string) => ({ filtered: p, linesRemoved: 0 })),
      };
      skillRouting = {
        getRoutingDirective: vi.fn(() => ({ relevantSkills: [], directive: '' })),
      };
      aliasCompression = {
        compress: vi.fn((t: string) => ({
          compressed: t,
          dictionaryHeader: '',
          aliasCount: 0,
        })),
      };
      service = new PromptOptimizerService(
        outputFilter,
        skillRouting,
        deltaContext,
        semanticCompressor,
        aliasCompression,
        metricsService
      );

      const original = 'c'.repeat(400);
      const result = await service.optimize(original, baseContext());

      // Expect roughly 50% savings
      expect(result.metrics.savingsPercent).toBeGreaterThan(40);
      expect(result.metrics.savingsPercent).toBeLessThanOrEqual(60);
    });

    it('returns 0 savingsPercent when no optimization happens', async () => {
      const config: TokenOptimizationConfig = {
        enabled: true,
        outputFiltering: false,
        skillRouting: false,
        deltaContext: false,
        semanticCompression: false,
        aliasCompression: false,
      };
      const result = await service.optimize('prompt', baseContext({ config }));

      expect(result.metrics.savingsPercent).toBe(0);
    });
  });

  // --- Spec file hashes propagation ---

  describe('spec file hashes', () => {
    it('returns spec file hashes from context when delta-context disabled', async () => {
      const previousHashes = { 'spec.yaml': 'previous-hash' };
      const config = { ...fullyEnabledConfig(), deltaContext: false };
      const result = await service.optimize(
        'prompt',
        baseContext({ config, previousSpecFileHashes: previousHashes })
      );

      expect(result.specFileHashes).toEqual(previousHashes);
    });
  });

  // --- Net-positive gate ---

  describe('net-positive gate', () => {
    // These tests exercise the total-net-positive safety check: if the
    // optimization pipeline produces a prompt that is LARGER than the
    // original (because per-capability overheads like the skill-routing
    // directive and alias dictionary header exceed the savings from
    // compression), the optimizer must return the ORIGINAL prompt — not
    // the grown one. Otherwise the layer actively hurts short prompts
    // while claiming "savings=0%".

    it('returns the original prompt when the optimized prompt grew', async () => {
      // Each mock adds bytes, so the final result will be larger than input.
      outputFilter = makeOutputFilterMock({
        filtered: 'short input [OUTPUT_FILTER_OVERHEAD_ADDED]',
        linesRemoved: 0,
      });
      skillRouting = makeSkillRoutingMock({
        relevantSkills: ['a', 'b', 'c'],
        directive: '## Skills\nthis directive is much longer than the input and adds many tokens',
      });
      semanticCompressor = makeSemanticCompressorMock({
        compressed: 'no change at all to the text here',
        compressionRatio: 1.0,
      });
      aliasCompression = makeAliasCompressionMock({
        compressed:
          '## Aliases\n$A1 = "overhead"\n$A2 = "more overhead"\n\nno change at all to the text here',
        dictionaryHeader: '## Aliases\n$A1 = "overhead"\n$A2 = "more overhead"\n\n',
        aliasCount: 2,
      });
      service = new PromptOptimizerService(
        outputFilter,
        skillRouting,
        deltaContext,
        semanticCompressor,
        aliasCompression,
        metricsService
      );

      const input = 'short input';
      const result = await service.optimize(input, baseContext());

      // The prompt that actually goes to the LLM must be the ORIGINAL —
      // not the larger "optimized" version.
      expect(result.prompt).toBe(input);
    });

    it('reports zero savings and empty capabilities when the gate fires', async () => {
      outputFilter = makeOutputFilterMock({
        filtered: 'short input [OUTPUT_FILTER_OVERHEAD_ADDED]',
        linesRemoved: 0,
      });
      skillRouting = makeSkillRoutingMock({
        relevantSkills: ['a', 'b', 'c'],
        directive: '## Skills\nthis directive is much longer than the input and adds many tokens',
      });
      aliasCompression = makeAliasCompressionMock({
        compressed: '## Aliases\n$A1 = "overhead"\n$A2 = "more overhead"\n\nshort input',
        dictionaryHeader: '## Aliases\n$A1 = "overhead"\n$A2 = "more overhead"\n\n',
        aliasCount: 2,
      });
      service = new PromptOptimizerService(
        outputFilter,
        skillRouting,
        deltaContext,
        semanticCompressor,
        aliasCompression,
        metricsService
      );

      const result = await service.optimize('short input', baseContext());

      expect(result.metrics.optimizedTokenEstimate).toBe(result.metrics.originalTokenEstimate);
      expect(result.metrics.savingsPercent).toBe(0);
      expect(result.metrics.capabilitiesApplied).toEqual([]);
    });

    it('keeps the optimized prompt when it is smaller than the original', async () => {
      // A realistic compression scenario — the compressor produces a
      // smaller output than the input, so the gate should NOT fire.
      outputFilter = makeOutputFilterMock({
        filtered: 'the quick brown fox jumps over',
        linesRemoved: 0,
      });
      skillRouting = makeSkillRoutingMock({ relevantSkills: [], directive: '' });
      semanticCompressor = makeSemanticCompressorMock({
        compressed: 'quick brown fox jumps over',
        compressionRatio: 0.85,
      });
      aliasCompression = makeAliasCompressionMock({
        compressed: 'quick brown fox jumps over',
        dictionaryHeader: '',
        aliasCount: 0,
      });
      service = new PromptOptimizerService(
        outputFilter,
        skillRouting,
        deltaContext,
        semanticCompressor,
        aliasCompression,
        metricsService
      );

      const input =
        'the quick brown fox jumps over the lazy dog the quick brown fox jumps over the lazy dog';
      const result = await service.optimize(input, baseContext());

      // The optimized prompt is shorter, so the gate does NOT fire.
      expect(result.prompt).not.toBe(input);
      expect(result.metrics.optimizedTokenEstimate).toBeLessThan(
        result.metrics.originalTokenEstimate
      );
      expect(result.metrics.savingsPercent).toBeGreaterThan(0);
      expect(result.metrics.capabilitiesApplied.length).toBeGreaterThan(0);
    });
  });

  // --- Empty prompt handling ---

  describe('empty input handling', () => {
    it('handles empty prompt gracefully', async () => {
      const result = await service.optimize('', baseContext());
      expect(typeof result.prompt).toBe('string');
      expect(result.metrics.originalTokenEstimate).toBe(0);
    });
  });

  // --- Metrics recording ---

  describe('metrics recording', () => {
    it('records metrics via metricsService when phaseTimingId is provided', async () => {
      const result = await service.optimize('the prompt', baseContext({ phaseTimingId: 'pt-123' }));

      expect(metricsService.record).toHaveBeenCalledTimes(1);
      expect(metricsService.record).toHaveBeenCalledWith('pt-123', result.metrics);
    });

    it('does not call metricsService.record when phaseTimingId is omitted', async () => {
      await service.optimize('the prompt', baseContext());

      expect(metricsService.record).not.toHaveBeenCalled();
    });

    it('does not call metricsService.record when master toggle is off', async () => {
      await service.optimize(
        'the prompt',
        baseContext({
          phaseTimingId: 'pt-123',
          config: { ...fullyEnabledConfig(), enabled: false },
        })
      );

      expect(metricsService.record).not.toHaveBeenCalled();
    });

    it('does not throw when metricsService.record rejects', async () => {
      metricsService = {
        record: vi.fn().mockRejectedValue(new Error('db is down')),
        getByPhaseTimingId: vi.fn().mockResolvedValue(null),
      };
      service = new PromptOptimizerService(
        outputFilter,
        skillRouting,
        deltaContext,
        semanticCompressor,
        aliasCompression,
        metricsService
      );

      await expect(
        service.optimize('the prompt', baseContext({ phaseTimingId: 'pt-123' }))
      ).resolves.toBeDefined();
    });

    it('still returns the optimized prompt when metricsService.record rejects', async () => {
      metricsService = {
        record: vi.fn().mockRejectedValue(new Error('db is down')),
        getByPhaseTimingId: vi.fn().mockResolvedValue(null),
      };
      service = new PromptOptimizerService(
        outputFilter,
        skillRouting,
        deltaContext,
        semanticCompressor,
        aliasCompression,
        metricsService
      );

      const result = await service.optimize(
        NET_POSITIVE_INPUT,
        baseContext({ phaseTimingId: 'pt-123' })
      );

      expect(typeof result.prompt).toBe('string');
      expect(result.metrics.capabilitiesApplied.length).toBeGreaterThan(0);
    });

    it('records metrics with all aggregated capability stats', async () => {
      outputFilter = makeOutputFilterMock({ linesRemoved: 10 });
      semanticCompressor = makeSemanticCompressorMock({ compressionRatio: 0.7 });
      aliasCompression = makeAliasCompressionMock({ aliasCount: 3 });
      service = new PromptOptimizerService(
        outputFilter,
        skillRouting,
        deltaContext,
        semanticCompressor,
        aliasCompression,
        metricsService
      );

      await service.optimize(NET_POSITIVE_INPUT, baseContext({ phaseTimingId: 'pt-456' }));

      expect(metricsService.record).toHaveBeenCalledTimes(1);
      const recordedMetrics = (metricsService.record as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(recordedMetrics.outputFilterLinesRemoved).toBe(10);
      expect(recordedMetrics.compressionRatio).toBe(0.7);
      expect(recordedMetrics.aliasesCreated).toBe(3);
    });
  });
});
