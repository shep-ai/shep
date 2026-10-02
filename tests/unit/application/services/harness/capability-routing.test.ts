import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HarnessDecisionKind,
  HarnessTaskType,
  RiskClass,
  ToolReadWriteMode,
  ToolSourceKind,
  type Capability,
} from '@/domain/generated/output.js';
import type { IToolExecutor, IToolSource } from '@/application/ports/output/harness/index.js';
import { CapabilityRegistry } from '@/application/services/harness/capability-registry.js';
import {
  CapabilityRouter,
  CapabilityRoutingError,
  DEFAULT_CAPABILITY_CANDIDATE_LIMIT,
} from '@/application/services/harness/capability-router.js';
import { DecisionService } from '@/application/services/harness/decision-service.js';
import { DecisionProviderFactory } from '@/infrastructure/services/harness/decisions/decision-provider-factory.js';
import { BuiltinToolSource } from '@/infrastructure/services/harness/tools/builtin-tool-source.js';
import { AjvToolArgumentValidator } from '@/infrastructure/services/harness/tools/ajv-tool-argument-validator.js';
import { resolveHarnessConfig } from '@/domain/harness/harness-config.js';
import {
  createHarnessTestStore,
  type HarnessTestStore,
} from '../../../../helpers/harness/harness-test-store.js';

function syntheticSource(count: number): IToolSource {
  const capabilities: Capability[] = [];
  const executors: IToolExecutor[] = [];
  for (let i = 0; i < count; i++) {
    const id = `synthetic_tool_${i}`;
    capabilities.push({
      id,
      title: id,
      snippet: `synthetic capability number ${i}`,
      tags: ['synthetic'],
      risk: RiskClass.Low,
      implementationIds: [`s.${id}`],
    });
    executors.push({
      implementation: {
        id: `s.${id}`,
        capabilityId: id,
        source: ToolSourceKind.Custom,
        toolName: id,
        snippet: id,
        inputSchema: { type: 'object', properties: { secretSchemaMarker: { type: 'string' } } },
        risk: RiskClass.Low,
        readWriteMode: ToolReadWriteMode.Read,
      },
      execute: vi.fn(),
    });
  }
  return { id: 'synthetic', discover: async () => ({ capabilities, executors }) };
}

describe('capability routing', () => {
  let store: HarnessTestStore;
  let decisions: DecisionService;

  beforeEach(async () => {
    store = await createHarnessTestStore();
    decisions = new DecisionService(
      resolveHarnessConfig(undefined).decisions,
      new DecisionProviderFactory(),
      store.execution,
      store.blobs
    );
  });
  afterEach(() => store.close());

  it('routes plain intents to the right builtin capability', async () => {
    const registry = await CapabilityRegistry.fromSources([new BuiltinToolSource()]);
    const router = new CapabilityRouter(registry, decisions);
    const cases: [string, string][] = [
      ['find where refreshToken is used in the source', 'search_source_code'],
      ['run the failing tests again', 'run_tests'],
      ['edit the file to fix the bug', 'apply_patch'],
      ['show the git diff of my changes', 'inspect_git'],
      ['read the content of src/auth/refresh.ts', 'read_file'],
    ];
    for (const [intent, expected] of cases) {
      const plan = await router.resolve(
        { description: intent, taskType: HarnessTaskType.Write },
        { taskId: 't' }
      );
      expect(plan.capabilityId, intent).toBe(expected);
      expect(plan.capabilityDecisionId).toBeTruthy();
    }
    const recorded = await store.execution.listDecisions('t', HarnessDecisionKind.CapabilityChoice);
    expect(recorded).toHaveLength(cases.length);
  });

  it('enforces an explicit capability and records a shadow pick only in shadow mode', async () => {
    const registry = await CapabilityRegistry.fromSources([new BuiltinToolSource()]);
    const plain = await new CapabilityRouter(registry, decisions).resolve(
      { description: 'look at it', capabilityId: 'read_file', taskType: HarnessTaskType.Write },
      { taskId: 't1' }
    );
    expect(plain).toMatchObject({ capabilityId: 'read_file' });
    expect(plain.capabilityDecisionId).toBeUndefined();

    const shadow = await new CapabilityRouter(registry, decisions, { shadow: true }).resolve(
      { description: 'run the tests', capabilityId: 'read_file', taskType: HarnessTaskType.Write },
      { taskId: 't2' }
    );
    expect(shadow.capabilityId).toBe('read_file');
    const [d] = await store.execution.listDecisions('t2');
    expect(d).toMatchObject({ shadow: true, enforced: false, result: { selected: 'run_tests' } });
  });

  it('rejects unknown capabilities with the list of valid ones', async () => {
    const registry = await CapabilityRegistry.fromSources([new BuiltinToolSource()]);
    await expect(
      new CapabilityRouter(registry, decisions).resolve(
        { description: 'x', capabilityId: 'deploy_prod', taskType: HarnessTaskType.Write },
        {}
      )
    ).rejects.toThrow(/Unknown capability "deploy_prod". Available: list_files/);
  });

  it('never offers write tools to a read-only task', async () => {
    const registry = await CapabilityRegistry.fromSources([new BuiltinToolSource()]);
    expect(() =>
      new CapabilityRouter(registry, decisions).chooseImplementation(
        'apply_patch',
        HarnessTaskType.ReadOnly
      )
    ).toThrow(CapabilityRoutingError);
  });

  it('a 1,000-capability catalog puts at most the candidate limit in front of the decision provider', async () => {
    const registry = await CapabilityRegistry.fromSources([
      new BuiltinToolSource(),
      syntheticSource(1000),
    ]);
    expect(registry.list()).toHaveLength(1007);
    const router = new CapabilityRouter(registry, decisions);
    const plan = await router.resolve(
      { description: 'search the source for a symbol', taskType: HarnessTaskType.Write },
      { taskId: 'big' }
    );
    expect(plan.candidates.length).toBeLessThanOrEqual(DEFAULT_CAPABILITY_CANDIDATE_LIMIT);
    expect(plan.capabilityId).toBe('search_source_code');
    const [d] = await store.execution.listDecisions('big');
    const input = JSON.parse(await store.blobs.getText(d.inputRef)) as { choices: unknown[] };
    expect(input.choices.length).toBeLessThanOrEqual(DEFAULT_CAPABILITY_CANDIDATE_LIMIT);
  });

  it('the Tier-1 catalog never contains Tier-2 schema text', async () => {
    const registry = await CapabilityRegistry.fromSources([
      new BuiltinToolSource(),
      syntheticSource(1000),
    ]);
    const tier1 = registry.snippetCatalog();
    expect(tier1).not.toContain('secretSchemaMarker');
    expect(tier1).not.toContain('"type"');
    expect(registry.snippetCatalog(['read_file'])).toBe(
      'read_file — read a file or a line range of a file'
    );
  });
});

describe('AjvToolArgumentValidator', () => {
  it('validates builtin tool arguments before execution', async () => {
    const registry = await CapabilityRegistry.fromSources([new BuiltinToolSource()]);
    const v = new AjvToolArgumentValidator();
    const schema = registry.implementations('read_file')[0].inputSchema;
    expect(v.validate(schema, { path: 'src/a.ts' })).toEqual({ valid: true, errors: [] });
    const bad = v.validate(schema, { path: 3, extra: true });
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/must be string/);
    expect(bad.errors.join(' ')).toMatch(/extra/);
    expect(v.validate(registry.implementations('apply_patch')[0].inputSchema, {}).valid).toBe(
      false
    );
  });
});
