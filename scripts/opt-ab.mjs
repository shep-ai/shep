/* eslint-disable no-undef */
// Deterministic A/B of the PromptOptimizerService on the exact seed prompt
// used in run A'' (agent_run_id 5ce68c56), run in-process so there's zero
// LLM spend and zero nondeterminism.

import 'reflect-metadata';
import { readFileSync } from 'node:fs';

import { CommandOutputFilterService } from '../dist/packages/core/src/infrastructure/services/token-optimization/command-output-filter.service.js';
import { SkillRoutingService } from '../dist/packages/core/src/infrastructure/services/token-optimization/skill-routing.service.js';
import { DeltaContextService } from '../dist/packages/core/src/infrastructure/services/token-optimization/delta-context.service.js';
import { SemanticCompressorService } from '../dist/packages/core/src/infrastructure/services/token-optimization/semantic-compressor.service.js';
import { AliasCompressionService } from '../dist/packages/core/src/infrastructure/services/token-optimization/alias-compression.service.js';
import { PromptOptimizerService } from '../dist/packages/core/src/infrastructure/services/token-optimization/prompt-optimizer.service.js';

// Manual wiring — avoid DI so tsyringe metadata isn't required at runtime.
const optimizer = new PromptOptimizerService(
  new CommandOutputFilterService(),
  new SkillRoutingService(),
  new DeltaContextService(),
  new SemanticCompressorService(),
  new AliasCompressionService()
);
const prompt = readFileSync('/tmp/seed-prompt.txt', 'utf-8');

const baseConfig = {
  enabled: true,
  outputFiltering: true,
  skillRouting: true,
  deltaContext: true,
  semanticCompression: true,
  aliasCompression: true,
};

async function runAndReport(label, config) {
  const result = await optimizer.optimize(prompt, {
    phaseName: 'fast-implement',
    modelId: 'claude-opus-4-6',
    featureId: 'test-feature',
    agentRunId: 'test-run',
    previousSpecFileHashes: {},
    config,
  });
  const m = result.metrics;
  console.log(
    `${label.padEnd(32)}  orig=${String(m.originalTokenEstimate).padStart(5)}  ` +
      `opt=${String(m.optimizedTokenEstimate).padStart(5)}  ` +
      `saved=${m.savingsPercent.toFixed(2).padStart(6)}%  ` +
      `caps=[${m.capabilitiesApplied.join(',')}]`
  );
}

console.log(`\nSeed prompt: ${prompt.length} chars\n`);

await runAndReport('enabled=false (baseline)', { ...baseConfig, enabled: false });
await runAndReport('all capabilities ON', baseConfig);
await runAndReport('only outputFiltering', {
  ...baseConfig,
  skillRouting: false,
  deltaContext: false,
  semanticCompression: false,
  aliasCompression: false,
});
await runAndReport('only skillRouting', {
  ...baseConfig,
  outputFiltering: false,
  deltaContext: false,
  semanticCompression: false,
  aliasCompression: false,
});
await runAndReport('only semanticCompression', {
  ...baseConfig,
  outputFiltering: false,
  skillRouting: false,
  deltaContext: false,
  aliasCompression: false,
});
await runAndReport('only aliasCompression', {
  ...baseConfig,
  outputFiltering: false,
  skillRouting: false,
  deltaContext: false,
  semanticCompression: false,
});
await runAndReport('only deltaContext', {
  ...baseConfig,
  outputFiltering: false,
  skillRouting: false,
  semanticCompression: false,
  aliasCompression: false,
});

// Show the ceiling on a much larger synthetic prompt with repetition.
console.log('\n--- 10x repeated seed to expose repetition savings ---\n');
const bigPrompt = Array.from({ length: 10 }, () => prompt).join('\n\n---\n\n');
console.log(`Large prompt: ${bigPrompt.length} chars\n`);
const bigOff = await optimizer.optimize(bigPrompt, {
  phaseName: 'fast-implement',
  modelId: 'claude-opus-4-6',
  featureId: 'f',
  agentRunId: 'r',
  previousSpecFileHashes: {},
  config: { ...baseConfig, enabled: false },
});
const bigOn = await optimizer.optimize(bigPrompt, {
  phaseName: 'fast-implement',
  modelId: 'claude-opus-4-6',
  featureId: 'f',
  agentRunId: 'r',
  previousSpecFileHashes: {},
  config: baseConfig,
});
console.log(
  `enabled=false : orig=${bigOff.metrics.originalTokenEstimate}  opt=${bigOff.metrics.optimizedTokenEstimate}`
);
console.log(
  `enabled=true  : orig=${bigOn.metrics.originalTokenEstimate}  opt=${bigOn.metrics.optimizedTokenEstimate}  (${bigOn.metrics.savingsPercent.toFixed(2)}%)`
);
