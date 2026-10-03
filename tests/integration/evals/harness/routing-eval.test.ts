/**
 * Capability routing eval (spec 119, task 32): ≥30 intents routed with the
 * deterministic decision provider (no network), scored against the
 * capability a person would pick. The bar is 90%: lexical routing is a
 * floor, and model-backed providers are measured with the paired eval.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HarnessTaskType } from '@/domain/generated/output.js';
import { resolveHarnessConfig } from '@/domain/harness/harness-config.js';
import { CapabilityRegistry } from '@/application/services/harness/capability-registry.js';
import { CapabilityRouter } from '@/application/services/harness/capability-router.js';
import { DecisionService } from '@/application/services/harness/decision-service.js';
import { DecisionProviderFactory } from '@/infrastructure/services/harness/decisions/decision-provider-factory.js';
import { BuiltinToolSource } from '@/infrastructure/services/harness/tools/builtin-tool-source.js';
import { createHarnessTestStore } from '../../../helpers/harness/harness-test-store.js';
import { report, type EvalCaseOutcome } from './eval-report.js';

const ROUTING_BAR = 0.9;
const suite = JSON.parse(readFileSync(join(import.meta.dirname, 'routing-cases.json'), 'utf8')) as {
  cases: { id: string; intent: string; expect: string }[];
};

describe('capability routing eval', () => {
  it(`routes ${suite.cases.length} intents at ≥${ROUTING_BAR * 100}%`, async () => {
    expect(suite.cases.length).toBeGreaterThanOrEqual(30);
    const store = await createHarnessTestStore();
    const registry = await CapabilityRegistry.fromSources([new BuiltinToolSource()]);
    const decisions = new DecisionService(
      resolveHarnessConfig(undefined).decisions,
      new DecisionProviderFactory(),
      store.execution,
      store.blobs
    );
    const router = new CapabilityRouter(registry, decisions);
    const outcomes: EvalCaseOutcome[] = [];
    for (const c of suite.cases) {
      const plan = await router.resolve(
        { description: c.intent, taskType: HarnessTaskType.Write },
        {}
      );
      outcomes.push({
        id: c.id,
        pass: plan.capabilityId === c.expect,
        expected: c.expect,
        actual: plan.capabilityId,
        note: c.intent,
      });
    }
    store.close();
    const r = report('routing', outcomes);
    expect(r.score, JSON.stringify(r.failures, null, 2)).toBeGreaterThanOrEqual(ROUTING_BAR);
  });
});
