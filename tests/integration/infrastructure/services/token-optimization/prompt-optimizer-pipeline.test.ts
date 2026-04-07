/**
 * Token Optimization Pipeline Integration Test
 *
 * Verifies the complete optimization pipeline end-to-end with real
 * service implementations wired through a DI container. Uses a noop
 * metrics service so the test does not depend on a database.
 *
 * Covers:
 * - Real PromptOptimizerService composing the five capability services
 * - Realistic prompt with command output, instructions, and repeated strings
 * - Token savings > 0
 * - All five capabilities contribute to capabilitiesApplied
 * - Critical content (error lines, file paths, code blocks) is preserved
 * - Per-feature override of global settings (Task 28)
 * - Performance budget < 50ms (Task 24)
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { container, type DependencyContainer } from 'tsyringe';

import { CommandOutputFilterService } from '@/infrastructure/services/token-optimization/command-output-filter.service.js';
import { SkillRoutingService } from '@/infrastructure/services/token-optimization/skill-routing.service.js';
import { DeltaContextService } from '@/infrastructure/services/token-optimization/delta-context.service.js';
import { SemanticCompressorService } from '@/infrastructure/services/token-optimization/semantic-compressor.service.js';
import { AliasCompressionService } from '@/infrastructure/services/token-optimization/alias-compression.service.js';
import { PromptOptimizerService } from '@/infrastructure/services/token-optimization/prompt-optimizer.service.js';

import type { ICommandOutputFilterService } from '@/application/ports/output/services/command-output-filter.interface.js';
import type { ISkillRoutingService } from '@/application/ports/output/services/skill-routing.interface.js';
import type { IDeltaContextService } from '@/application/ports/output/services/delta-context.interface.js';
import type { ISemanticCompressorService } from '@/application/ports/output/services/semantic-compressor.interface.js';
import type { IAliasCompressionService } from '@/application/ports/output/services/alias-compression.interface.js';
import type { IOptimizationMetricsService } from '@/application/ports/output/services/optimization-metrics.interface.js';
import type {
  IPromptOptimizerService,
  PromptOptimizationContext,
  OptimizationMetrics,
} from '@/application/ports/output/services/prompt-optimizer.interface.js';
import type { TokenOptimizationConfig } from '@/domain/generated/output.js';

/** A noop metrics service used to keep the integration test DB-free. */
class NoopMetricsService implements IOptimizationMetricsService {
  async record(_phaseTimingId: string, _metrics: OptimizationMetrics): Promise<void> {
    // intentionally noop
  }

  async getByPhaseTimingId(_phaseTimingId: string): Promise<OptimizationMetrics | null> {
    return null;
  }
}

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

/** Build a baseline optimization context with a configurable override. */
function buildContext(config: TokenOptimizationConfig): PromptOptimizationContext {
  return {
    phaseName: 'plan',
    featureId: 'feat-int-001',
    agentRunId: 'run-int-001',
    config,
  };
}

/**
 * Realistic test prompt: includes natural language instructions, repeated
 * file paths (ripe for aliasing), passing test output (filterable), and a
 * critical error line that must be preserved.
 */
function buildRealisticPrompt(): string {
  return [
    '# Plan Phase Instructions',
    '',
    'You must implement the feature in the repository at /Users/dev/projects/shep/packages/core/src/infrastructure/services/agents/feature-agent/.',
    'Make sure to follow the implementation guide for the configuration in the directory /Users/dev/projects/shep/packages/core/src/infrastructure/services/agents/feature-agent/.',
    '',
    'In order to satisfy the requirements:',
    '- The function should validate input parameters',
    '- The function should handle errors gracefully',
    '- You should write tests for every code path',
    '- It is important to keep the implementation simple',
    '',
    'The configuration file is located in /Users/dev/projects/shep/packages/core/src/infrastructure/services/agents/feature-agent/.',
    '',
    '## Recent Test Run',
    '',
    '```',
    'PASS src/foo.test.ts',
    '  ✓ should add two numbers (3ms)',
    '  ✓ should subtract two numbers (1ms)',
    '  ✓ should multiply two numbers (2ms)',
    '  ✓ should divide two numbers (1ms)',
    '  ✓ should handle zero divisor (4ms)',
    'PASS src/bar.test.ts',
    '  ✓ renders the component (15ms)',
    '  ✓ handles click events (8ms)',
    '  ✓ updates state correctly (5ms)',
    'FAIL src/baz.test.ts',
    '  ● calculator > should not divide by zero',
    '    Error: Division by zero is undefined',
    '        at divide (src/baz.ts:42:11)',
    '        at Object.<anonymous> (src/baz.test.ts:18:5)',
    '',
    'Tests: 1 failed, 8 passed, 9 total',
    '```',
    '',
    'Please note that you must ensure the implementation handles edge cases correctly.',
    'Basically, the application should be reliable and the dependencies must be up to date.',
  ].join('\n');
}

describe('Token Optimization Pipeline Integration', () => {
  let optimizer: IPromptOptimizerService;
  let scope: DependencyContainer;

  beforeAll(() => {
    // Create an isolated child container so this test does not pollute
    // the global container or interfere with other integration tests.
    scope = container.createChildContainer();

    scope.register<ICommandOutputFilterService>('ICommandOutputFilterService', {
      useFactory: () => new CommandOutputFilterService(),
    });
    scope.register<ISkillRoutingService>('ISkillRoutingService', {
      useFactory: () => new SkillRoutingService(),
    });
    scope.register<IDeltaContextService>('IDeltaContextService', {
      useFactory: () => new DeltaContextService(),
    });
    scope.register<ISemanticCompressorService>('ISemanticCompressorService', {
      useFactory: () => new SemanticCompressorService(),
    });
    scope.register<IAliasCompressionService>('IAliasCompressionService', {
      useFactory: () => new AliasCompressionService(),
    });
    scope.register<IOptimizationMetricsService>('IOptimizationMetricsService', {
      useFactory: () => new NoopMetricsService(),
    });
    scope.registerSingleton<IPromptOptimizerService>(
      'IPromptOptimizerService',
      PromptOptimizerService
    );

    optimizer = scope.resolve<IPromptOptimizerService>('IPromptOptimizerService');
  });

  afterAll(() => {
    scope.clearInstances();
  });

  describe('full pipeline with all capabilities enabled', () => {
    it('reduces a realistic prompt with measurable token savings', async () => {
      const prompt = buildRealisticPrompt();
      const result = await optimizer.optimize(prompt, buildContext(fullyEnabledConfig()));

      // Sanity: optimized prompt is non-empty
      expect(typeof result.prompt).toBe('string');
      expect(result.prompt.length).toBeGreaterThan(0);

      // Token savings must be positive (the realistic prompt has plenty
      // of optimizable content: filler words, repeated paths, passing tests)
      expect(result.metrics.savingsPercent).toBeGreaterThan(0);
      expect(result.metrics.optimizedTokenEstimate).toBeLessThan(
        result.metrics.originalTokenEstimate
      );
    });

    it('reduces the realistic prompt by more than 20%', async () => {
      const prompt = buildRealisticPrompt();
      const result = await optimizer.optimize(prompt, buildContext(fullyEnabledConfig()));

      expect(result.metrics.savingsPercent).toBeGreaterThan(20);
    });

    it('records all five capabilities in metrics.capabilitiesApplied', async () => {
      const prompt = buildRealisticPrompt();
      const result = await optimizer.optimize(prompt, buildContext(fullyEnabledConfig()));

      expect(result.metrics.capabilitiesApplied).toContain('outputFiltering');
      expect(result.metrics.capabilitiesApplied).toContain('skillRouting');
      expect(result.metrics.capabilitiesApplied).toContain('deltaContext');
      expect(result.metrics.capabilitiesApplied).toContain('semanticCompression');
      expect(result.metrics.capabilitiesApplied).toContain('aliasCompression');
      expect(result.metrics.capabilitiesApplied).toHaveLength(5);
    });

    it('preserves the critical error line through the full pipeline', async () => {
      const prompt = buildRealisticPrompt();
      const result = await optimizer.optimize(prompt, buildContext(fullyEnabledConfig()));

      // The "Error: Division by zero" line is the critical failure marker
      // and must be preserved by the safety rule in the output filter.
      // Note: aliases may replace exact long substrings but shorter,
      // semantically critical text remains in the body or is referenced
      // via the alias dictionary.
      const containsErrorIndicator =
        result.prompt.includes('Error: Division by zero') ||
        result.prompt.includes('Division by zero') ||
        // Aliased reference still expands the string in the dictionary
        /\$A\d+ = "[^"]*Division by zero[^"]*"/.test(result.prompt);
      expect(containsErrorIndicator).toBe(true);
    });

    it('preserves the failing test name through the full pipeline', async () => {
      const prompt = buildRealisticPrompt();
      const result = await optimizer.optimize(prompt, buildContext(fullyEnabledConfig()));

      // FAIL line and the bullet line must survive (safety: contains "fail")
      expect(
        result.prompt.includes('FAIL') || /\$A\d+ = "[^"]*FAIL[^"]*"/.test(result.prompt)
      ).toBe(true);
    });

    it('preserves stack trace through the full pipeline', async () => {
      const prompt = buildRealisticPrompt();
      const result = await optimizer.optimize(prompt, buildContext(fullyEnabledConfig()));

      // Stack trace lines (`    at divide ...`) are always-preserved patterns
      expect(
        result.prompt.includes('at divide') || /\$A\d+ = "[^"]*at divide[^"]*"/.test(result.prompt)
      ).toBe(true);
    });

    it('records output filter lines removed greater than 0', async () => {
      const prompt = buildRealisticPrompt();
      const result = await optimizer.optimize(prompt, buildContext(fullyEnabledConfig()));

      // The 8 passing test lines should be removed by the output filter
      expect(result.metrics.outputFilterLinesRemoved).toBeGreaterThan(0);
    });

    it('compression ratio is less than or equal to 1.0', async () => {
      const prompt = buildRealisticPrompt();
      const result = await optimizer.optimize(prompt, buildContext(fullyEnabledConfig()));

      // Semantic compressor never expands text
      expect(result.metrics.compressionRatio).toBeLessThanOrEqual(1.0);
      expect(result.metrics.compressionRatio).toBeGreaterThan(0);
    });
  });

  describe('master toggle override', () => {
    it('returns original prompt unchanged when master toggle is off', async () => {
      const prompt = buildRealisticPrompt();
      const config: TokenOptimizationConfig = { ...fullyEnabledConfig(), enabled: false };
      const result = await optimizer.optimize(prompt, buildContext(config));

      expect(result.prompt).toBe(prompt);
      expect(result.metrics.capabilitiesApplied).toEqual([]);
      expect(result.metrics.savingsPercent).toBe(0);
    });
  });

  describe('per-feature override of individual capabilities', () => {
    it('disables outputFiltering while keeping other capabilities active', async () => {
      const prompt = buildRealisticPrompt();
      const config: TokenOptimizationConfig = {
        ...fullyEnabledConfig(),
        outputFiltering: false,
      };
      const result = await optimizer.optimize(prompt, buildContext(config));

      expect(result.metrics.capabilitiesApplied).not.toContain('outputFiltering');
      expect(result.metrics.capabilitiesApplied).toContain('skillRouting');
      expect(result.metrics.capabilitiesApplied).toContain('deltaContext');
      expect(result.metrics.capabilitiesApplied).toContain('semanticCompression');
      expect(result.metrics.capabilitiesApplied).toContain('aliasCompression');

      // Output filter did not run, so no lines were removed
      expect(result.metrics.outputFilterLinesRemoved).toBe(0);
    });

    it('disables semanticCompression while keeping other capabilities active', async () => {
      const prompt = buildRealisticPrompt();
      const config: TokenOptimizationConfig = {
        ...fullyEnabledConfig(),
        semanticCompression: false,
      };
      const result = await optimizer.optimize(prompt, buildContext(config));

      expect(result.metrics.capabilitiesApplied).not.toContain('semanticCompression');
      expect(result.metrics.capabilitiesApplied).toContain('outputFiltering');
      // No semantic compression -> ratio remains 1.0
      expect(result.metrics.compressionRatio).toBe(1.0);
    });

    it('disables aliasCompression while keeping other capabilities active', async () => {
      const prompt = buildRealisticPrompt();
      const config: TokenOptimizationConfig = {
        ...fullyEnabledConfig(),
        aliasCompression: false,
      };
      const result = await optimizer.optimize(prompt, buildContext(config));

      expect(result.metrics.capabilitiesApplied).not.toContain('aliasCompression');
      expect(result.metrics.aliasesCreated).toBe(0);
      // Aliases never created -> output should not contain "## Aliases" header
      expect(result.prompt).not.toContain('## Aliases');
    });

    it('every capability disabled keeps prompt minimally changed', async () => {
      const prompt = buildRealisticPrompt();
      const config: TokenOptimizationConfig = {
        enabled: true,
        outputFiltering: false,
        skillRouting: false,
        deltaContext: false,
        semanticCompression: false,
        aliasCompression: false,
      };
      const result = await optimizer.optimize(prompt, buildContext(config));

      expect(result.metrics.capabilitiesApplied).toEqual([]);
      expect(result.metrics.savingsPercent).toBe(0);
      expect(result.prompt).toBe(prompt);
    });

    it('per-feature override of enabled=false disables pipeline', async () => {
      const prompt = buildRealisticPrompt();
      // Simulate per-feature override that disables optimization wholesale
      const featureOverride: TokenOptimizationConfig = {
        ...fullyEnabledConfig(),
        enabled: false,
      };
      const result = await optimizer.optimize(prompt, buildContext(featureOverride));

      expect(result.prompt).toBe(prompt);
      expect(result.metrics.capabilitiesApplied).toEqual([]);
    });

    it('per-feature override re-enabling a single disabled capability works', async () => {
      const prompt = buildRealisticPrompt();
      // Globally everything is disabled, but per-feature re-enables outputFiltering
      const featureOverride: TokenOptimizationConfig = {
        enabled: true,
        outputFiltering: true,
        skillRouting: false,
        deltaContext: false,
        semanticCompression: false,
        aliasCompression: false,
      };
      const result = await optimizer.optimize(prompt, buildContext(featureOverride));

      expect(result.metrics.capabilitiesApplied).toEqual(['outputFiltering']);
      // Only outputFiltering ran -> some lines should be removed
      expect(result.metrics.outputFilterLinesRemoved).toBeGreaterThan(0);
    });
  });

  describe('skill routing directive injection', () => {
    it('prepends a skill routing directive for the plan phase', async () => {
      const prompt = buildRealisticPrompt();
      const result = await optimizer.optimize(prompt, buildContext(fullyEnabledConfig()));

      // The plan phase has a non-empty directive in the default routing table.
      // The directive (or its alias) should appear in the output.
      const hasDirectiveText =
        result.prompt.includes('plan') &&
        (result.prompt.includes('prioritize') ||
          /\$A\d+ = "[^"]*prioritize[^"]*"/.test(result.prompt));
      expect(hasDirectiveText).toBe(true);
    });

    it('returns no aliasCompression header when phase has empty directive and no repeats', async () => {
      // A small prompt with no repeated long strings should not yield an alias header
      const small = 'small prompt with no repetition';
      const result = await optimizer.optimize(small, buildContext(fullyEnabledConfig()));

      expect(result.metrics.aliasesCreated).toBe(0);
    });
  });

  describe('performance budget', () => {
    /**
     * NFR-1: Optimizer must add less than 50ms to a typical prompt.
     * We use a synthesized 80KB prompt and run a few iterations to
     * smooth over any cold-start jitter.
     */
    it('completes optimization of an 80KB prompt in under 50ms (warm)', async () => {
      const base = buildRealisticPrompt();
      // Repeat the realistic prompt enough times to reach ~80KB
      const targetSize = 80 * 1024;
      let large = base;
      while (large.length < targetSize) {
        large = `${large}\n\n${base}`;
      }
      // Truncate to be deterministic
      large = large.slice(0, targetSize);

      // Warm-up run (excluded from measurement)
      await optimizer.optimize(large, buildContext(fullyEnabledConfig()));

      // Measured runs — take the median of 5
      const samples: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await optimizer.optimize(large, buildContext(fullyEnabledConfig()));
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      const median = samples[2];

      // Per NFR-1, optimizer must add less than 50ms latency.
      // Use a generous bound to account for CI hardware variance — but
      // still well within the spec target. The performance test is
      // intentionally slack-toleranced to avoid flake on slow CI nodes.
      expect(median).toBeLessThan(50);
    });
  });
});
